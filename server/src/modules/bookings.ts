import { Prisma } from "@prisma/client";
import { Router } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardForCompletedBooking, notify } from "../lib/customer-effects";
import { addDaysKey, currentHour, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send, timeStr } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { DEAD, claimFonepay, gameLabel, paysSchema, settle } from "../lib/settle";
import { getHourPrice } from "./settings-store";

export const bookingsRouter = Router();

// Same short code the customer sees ("UF-7K3QX9"); no 0/O/1/I so it is easy to read over the phone.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = "UF-" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!(await prisma.booking.findFirst({ where: { code }, select: { id: true } }))) return code;
  }
  throw new AppError(500, "Could not make a booking code");
}

const withCode = <T extends { id: string; code: string | null }>(b: T) => ({ ...b, code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase() });

async function load(idOrCode: string) {
  const b = await prisma.booking.findFirst({ where: { OR: [{ id: idOrCode }, { code: idOrCode }] } });
  if (!b) throw new AppError(404, "Booking not found");
  return b;
}

// Membership payment rows are an accounting ledger, not games on the court: the customer app hides them too.
// (SQL NOT on a NULL note would drop every booking without notes, so NULL is allowed explicitly.)
export const NOT_LEDGER: Prisma.BookingWhereInput = { AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }, { paymentMethod: { not: "membership" } }] };

function scopeDate(scope: string): string | Prisma.StringFilter {
  const t = todayKey();
  return scope === "today" ? t : scope === "upcoming" ? { gt: t } : { lt: t };
}

bookingsRouter.get("/", requirePermission("bookings.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const scope = q.scope && ["upcoming", "today", "previous"].includes(q.scope) ? q.scope : undefined;
  const dateFilter = scope ? scopeDate(scope) : q.date ? q.date : q.from || q.to ? { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } : undefined;
  const where: Prisma.BookingWhereInput = {
    AND: [
      NOT_LEDGER,
      ...(dateFilter ? [{ date: dateFilter }] : []),
      ...(q.status ? [{ status: q.status }] : []),
      ...(q.paymentStatus ? [{ paymentStatus: q.paymentStatus }] : []),
      ...(q.q ? [{ OR: [{ code: { contains: q.q, mode: "insensitive" as const } }, { customerName: { contains: q.q, mode: "insensitive" as const } }, { customerPhone: { contains: q.q } }, { userId: { contains: q.q } }] }] : []),
    ],
  };
  // Upcoming reads soonest first; today by start time; previous newest first.
  const asc = scope === "upcoming" || scope === "today";
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: asc ? [{ date: "asc" }, { startTime: "asc" }] : [{ date: "desc" }, { startTime: "desc" }], take, skip }),
    prisma.booking.count({ where }),
  ]);
  send(res, { items: rows.map(withCode), total, page: pageNo, limit });
}));

// Tab badges: how many bookings are upcoming, today and previous (cancelled and expired holds included in previous).
// Calendar dots: live bookings per day for one month (`?month=YYYY-MM`). Cancelled and expired bookings do not count.
bookingsRouter.get("/calendar", requirePermission("bookings.view"), handler(async (req, res) => {
  const month = parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM"), req.query.month);
  const rows = await prisma.booking.groupBy({
    by: ["date"],
    where: { AND: [NOT_LEDGER, { date: { gte: `${month}-01`, lte: `${month}-31` } }, { status: { notIn: ["cancelled", "expired"] } }] },
    _count: { _all: true },
  });
  send(res, rows.map((r) => ({ date: r.date, count: r._count._all })));
}));

bookingsRouter.get("/counts", requirePermission("bookings.view"), handler(async (_req, res) => {
  const [upcoming, today, previous] = await Promise.all(["upcoming", "today", "previous"].map((s) => prisma.booking.count({ where: { AND: [NOT_LEDGER, { date: scopeDate(s) }] } })));
  send(res, { upcoming, today, previous });
}));

// ---- dues: what one customer still owes ----
type Owner = { userId: string | null; customerPhone: string | null };
const ownerKey = (b: Owner) => b.userId ?? (b.customerPhone && /^9\d{9}$/.test(b.customerPhone) ? b.customerPhone : null);
const sameOwner = (a: Owner, b: Owner) => !!ownerKey(a) && ownerKey(a) === ownerKey(b);
const owes = (b: { paymentStatus: string; status: string; paymentMethod: string }) =>
  b.paymentStatus !== "completed" && !DEAD.includes(b.status) && !(b.status === "pending" && b.paymentMethod !== "venue"); // an online booking still waiting for its QR is not a due
const dueView = (b: { id: string; code: string | null; date: string; startTime: string; endTime: string; totalPrice: number; status: string; promoCode: string | null }) => ({
  id: b.id, code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, startTime: b.startTime, endTime: b.endTime, total: Math.round(b.totalPrice), status: b.status, promoCode: b.promoCode,
});

// For an unpaid booking: the same customer's other unpaid bookings, old ones up to today (to be added to today's payment) and upcoming ones (optional).
bookingsRouter.get("/:id/dues", requirePermission("bookings.view"), handler(async (req, res) => {
  const b = await load(param(req, "id"));
  const key = ownerKey(b);
  const today = todayKey();
  const others = key
    ? await prisma.booking.findMany({ where: { id: { not: b.id }, OR: [{ userId: key }, { customerPhone: key }] }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 300 })
    : [];
  const unpaid = others.filter(owes);
  const past = unpaid.filter((x) => x.date < today), todays = unpaid.filter((x) => x.date === today), upcoming = unpaid.filter((x) => x.date > today);
  const user = b.userId ? await prisma.user.findUnique({ where: { phoneNumber: b.userId }, select: { name: true } }) : null;
  // goods given on credit are dues too; they sit on the customer's account (phone)
  const goods = key ? await prisma.goodsDue.findMany({ where: { userId: key, status: "due" }, orderBy: { createdAt: "asc" } }) : [];
  send(res, {
    goods: goods.map((g) => ({ id: g.id, items: g.items, amount: g.amount, createdAt: g.createdAt })),
    goodsTotal: goods.reduce((sum, g) => sum + g.amount, 0),
    customer: { name: user?.name ?? b.customerName, phone: key, registered: !!b.userId, known: !!key },
    current: { ...dueView(b), owed: owes(b) },
    past: past.map(dueView), today: todays.map(dueView), upcoming: upcoming.map(dueView),
    pastTotal: past.reduce((s, x) => s + Math.round(x.totalPrice), 0),
  });
}));

// Collect several of one customer's dues in one payment: unpaid bookings and goods on credit, paid in one method or split across several.
// A registered customer gets one bill (CB-...) in their payment history; games already played earn their points, upcoming ones when completed, goods when paid.
bookingsRouter.post("/collect-dues", requirePermission("payments.collect"), handler(async (req, res) => {
  const b = parse(z.object({
    anchorId: z.string().min(1), bookingIds: z.array(z.string().min(1)).max(40).default([]), goodsDueIds: z.array(z.string().min(1)).max(40).default([]),
    method: z.enum(["venue", "fonepay"]).optional(), payments: paysSchema.optional(), fonepayQrId: z.string().min(1).optional(),
  }), req.body);
  if (b.bookingIds.length === 0 && b.goodsDueIds.length === 0) throw new AppError(400, "Choose at least one due to collect");
  const anchor = await load(b.anchorId);
  const key = ownerKey(anchor);
  const rows = await prisma.booking.findMany({ where: { id: { in: [...new Set(b.bookingIds)] } } });
  if (rows.length !== new Set(b.bookingIds).size) throw new AppError(404, "One of the bookings was not found");
  for (const r of rows) {
    if (r.id !== anchor.id && !sameOwner(anchor, r)) throw new AppError(400, "These bookings do not all belong to the same customer");
    if (DEAD.includes(r.status)) throw new AppError(409, `${gameLabel(r)} is ${r.status}`);
  }
  const goodsDues = await prisma.goodsDue.findMany({ where: { id: { in: [...new Set(b.goodsDueIds)] } } });
  if (goodsDues.length !== new Set(b.goodsDueIds).size || goodsDues.some((g) => g.userId !== key)) throw new AppError(400, "These dues do not all belong to the same customer");
  const account = key ? await prisma.user.findUnique({ where: { phoneNumber: key }, select: { phoneNumber: true } }) : null;
  const r = await settle({
    staffId: req.staff!.id, userId: anchor.userId ?? account?.phoneNumber ?? null, bookings: rows, goodsDues, items: new Map(),
    pay: { payments: b.payments, fonepayQrId: b.fonepayQrId, single: b.payments ? undefined : b.method === "fonepay" ? ("fonepay" as const) : ("cash" as const) },
  });
  await audit(req, "collect-dues", "booking", anchor.id, { bookings: rows.map((x) => x.code ?? x.id), goodsDues: goodsDues.map((g) => g.items), total: r.total, payments: r.payments, bill: r.code });
  send(res, { count: r.count, total: r.total, billCode: r.code, points: Math.round((r.pointsGoods + r.pointsGames) * 10) / 10, payments: r.payments, lines: r.lines }, `Collected Rs. ${r.total} for ${r.count} due${r.count === 1 ? "" : "s"}`);
}));

bookingsRouter.get("/:id", requirePermission("bookings.view"), handler(async (req, res) => {
  const b = await load(param(req, "id"));
  const [order, stats] = await Promise.all([
    b.paymentOrderCode ? prisma.paymentOrder.findUnique({ where: { orderCode: b.paymentOrderCode } }) : null,
    prisma.playerGameStat.findMany({ where: { bookingId: b.id } }),
  ]);
  send(res, { booking: withCode(b), paymentOrder: order, playerStats: stats });
}));

// Walk-in: staff books an hour for someone standing at the desk (or phoning in).
const walkIn = z.object({
  date: dateStr, startTime: timeStr, duration: z.number().int().min(1).max(4).default(1),
  customerName: z.string().min(2).max(60),
  customerPhone: z.string().regex(/^9\d{9}$/, "mobile number like 98XXXXXXXX").optional(),
  paymentMethod: z.enum(["venue", "fonepay"]).default("venue"),
  paid: z.boolean().default(false),
  priceOverride: z.number().int().min(0).optional(),
  notes: z.string().max(300).optional(),
});

bookingsRouter.post("/walk-in", requirePermission("bookings.create"), handler(async (req, res) => {
  const b = parse(walkIn, req.body);
  if (b.paid && b.paymentMethod === "fonepay") throw new AppError(400, "A Fonepay payment needs a QR: book it as not paid, then collect it from the booking with the Fonepay QR");
  // Staff may log a game that already happened (retroactive) or book ahead, within a sane range.
  if (b.date < addDaysKey(todayKey(), -60) || b.date > addDaysKey(todayKey(), 60)) throw new AppError(400, "Pick a date within 60 days of today");
  const startHour = Number(b.startTime.slice(0, 2));
  if (startHour + b.duration > 24) throw new AppError(400, "The booking cannot pass midnight");
  let basePrice = 0;
  for (let i = 0; i < b.duration; i++) basePrice += await getHourPrice(startHour + i);
  const total = b.priceOverride ?? basePrice;
  const user = b.customerPhone ? await prisma.user.findUnique({ where: { phoneNumber: b.customerPhone }, select: { phoneNumber: true } }) : null;
  const code = await uniqueCode();
  // A game whose hour has already passed is logged as completed.
  const ended = b.date < todayKey() || (b.date === todayKey() && startHour + b.duration <= currentHour());
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.create({
        data: {
          userId: user?.phoneNumber ?? null, date: b.date, startTime: b.startTime, endTime: `${String(startHour + b.duration).padStart(2, "0")}:00`, duration: b.duration,
          customerName: b.customerName, customerPhone: b.customerPhone ?? null, basePrice, subtotal: basePrice, totalPrice: total,
          discountAmount: Math.max(0, basePrice - total), paymentMethod: b.paymentMethod, status: ended ? "completed" : "confirmed",
          paymentStatus: b.paid ? "completed" : "pending", amountPaidNow: b.paid ? total : 0, remainingAmount: b.paid ? 0 : total,
          cashAmount: b.paid && b.paymentMethod === "venue" ? total : 0, onlineAmount: b.paid && b.paymentMethod !== "venue" ? total : 0,
          notes: ["WALK_IN", b.notes].filter(Boolean).join(" | "), code,
        },
      });
      // One row per hour; the unique (date, hour) index is the final guard against double booking.
      await tx.bookingSlot.createMany({ data: Array.from({ length: b.duration }, (_, i) => ({ date: b.date, hour: startHour + i, bookingId: row.id })) });
      return row;
    });
    if (ended) await awardForCompletedBooking(created);
    await audit(req, "walk-in", "booking", created.id, { code, date: b.date, startTime: b.startTime, total, paid: b.paid, retroactive: ended });
    send(res, withCode(created), "Booking created", 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That hour is already booked or blocked");
    throw e;
  }
}));

// Bulk booking: the same hour(s) on many dates at once (a weekly team slot, a month of mornings, a tournament block).
// dryRun shows each date as free or taken with its price and changes nothing. mode "free" books the free dates and skips the taken ones;
// mode "all" books everything or nothing.
const bulkWalkIn = z.object({
  dates: z.array(dateStr).min(1, "Choose at least one date").max(31, "At most 31 dates at a time"),
  startTime: timeStr, duration: z.number().int().min(1).max(4).default(1),
  customerName: z.string().min(2).max(60),
  customerPhone: z.string().regex(/^9\d{9}$/, "mobile number like 98XXXXXXXX").optional(),
  paymentMethod: z.enum(["venue", "fonepay"]).default("venue"),
  paid: z.boolean().default(false),
  priceOverride: z.number().int().min(0).optional(), // per game, applied to every date
  notes: z.string().max(300).optional(),
  mode: z.enum(["free", "all"]).default("free"),
  dryRun: z.boolean().default(false),
});

bookingsRouter.post("/walk-in/bulk", requirePermission("bookings.create"), handler(async (req, res) => {
  const b = parse(bulkWalkIn, req.body);
  if (b.paid && b.paymentMethod === "fonepay") throw new AppError(400, "A Fonepay payment needs a QR: book it as not paid, then collect it from the booking with the Fonepay QR");
  const dates = [...new Set(b.dates)].sort();
  if (dates[0] < addDaysKey(todayKey(), -60) || dates[dates.length - 1] > addDaysKey(todayKey(), 60)) throw new AppError(400, "Pick dates within 60 days of today");
  const startHour = Number(b.startTime.slice(0, 2));
  if (startHour + b.duration > 24) throw new AppError(400, "The booking cannot pass midnight");
  const hours = Array.from({ length: b.duration }, (_, i) => startHour + i);
  let basePrice = 0;
  for (const h of hours) basePrice += await getHourPrice(h);
  const total = b.priceOverride ?? basePrice;

  const taken = await prisma.bookingSlot.findMany({ where: { date: { in: dates }, hour: { in: hours } }, select: { date: true } });
  const busy = new Set(taken.map((t) => t.date));
  const plan = dates.map((date) => ({ date, free: !busy.has(date), price: total }));
  const free = plan.filter((p) => p.free);
  const summary = { requested: dates.length, free: free.length, taken: plan.length - free.length, pricePerGame: total, totalAmount: total * free.length };

  if (b.dryRun) return send(res, { plan, ...summary });
  if (b.mode === "all" && free.length !== plan.length) throw new AppError(409, `These dates are already booked or blocked: ${plan.filter((p) => !p.free).map((p) => p.date).join(", ")}`);
  if (free.length === 0) throw new AppError(409, "All of these dates are already booked or blocked");

  const user = b.customerPhone ? await prisma.user.findUnique({ where: { phoneNumber: b.customerPhone }, select: { phoneNumber: true } }) : null;
  const codes: string[] = [];
  for (let i = 0; i < free.length; i++) codes.push(await uniqueCode());
  const bulkId = codes[0];
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const [i, p] of free.entries()) {
        const ended = p.date < todayKey() || (p.date === todayKey() && startHour + b.duration <= currentHour());
        const row = await tx.booking.create({
          data: {
            userId: user?.phoneNumber ?? null, date: p.date, startTime: b.startTime, endTime: `${String(startHour + b.duration).padStart(2, "0")}:00`, duration: b.duration,
            customerName: b.customerName, customerPhone: b.customerPhone ?? null, basePrice, subtotal: basePrice, totalPrice: total,
            discountAmount: Math.max(0, basePrice - total), paymentMethod: b.paymentMethod, status: ended ? "completed" : "confirmed",
            paymentStatus: b.paid ? "completed" : "pending", amountPaidNow: b.paid ? total : 0, remainingAmount: b.paid ? 0 : total,
            cashAmount: b.paid && b.paymentMethod === "venue" ? total : 0, onlineAmount: b.paid && b.paymentMethod !== "venue" ? total : 0,
            notes: ["WALK_IN", `BULK ${bulkId}`, b.notes].filter(Boolean).join(" | "), code: codes[i],
          },
        });
        await tx.bookingSlot.createMany({ data: hours.map((hour) => ({ date: p.date, hour, bookingId: row.id })) });
        rows.push({ row, ended });
      }
      return rows;
    });
  } catch (e) {
    // an hour was taken by someone else while saving: the whole batch is cancelled, nothing is half-booked
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "One of the hours was just booked by someone else. Check the dates again.");
    throw e;
  }
  let points = 0;
  for (const c of created) if (c.ended && (await awardForCompletedBooking(c.row))) points++;
  await audit(req, "walk-in-bulk", "booking", bulkId, { dates: free.map((p) => p.date), skipped: plan.filter((p) => !p.free).map((p) => p.date), startTime: b.startTime, duration: b.duration, total, paid: b.paid });
  send(res, { created: created.map((c) => withCode(c.row)), skipped: plan.filter((p) => !p.free).map((p) => p.date), pointsAwardedFor: points, ...summary }, `${created.length} booking${created.length === 1 ? "" : "s"} created`, 201);
}));

bookingsRouter.post("/:id/cancel", requirePermission("bookings.cancel"), handler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().max(200).optional() }), req.body ?? {});
  const b = await load(param(req, "id"));
  if (b.status === "cancelled" || b.status === "completed") throw new AppError(409, `This booking is already ${b.status}`);
  await prisma.$transaction(async (tx) => {
    // The record is kept (customer records are never deleted); only the slot is freed.
    await tx.booking.update({ where: { id: b.id }, data: { status: "cancelled", cancelledAt: new Date(), holdExpiresAt: null } });
    await tx.bookingSlot.deleteMany({ where: { bookingId: b.id } });
    await tx.freeGameVoucher.updateMany({ where: { bookingId: b.id, status: "used" }, data: { status: "unused", bookingId: null, usedAt: null } });
    const order = b.paymentOrderCode ? await tx.paymentOrder.findUnique({ where: { orderCode: b.paymentOrderCode } }) : null;
    if (order?.status === "paid") {
      await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "refunded" } });
      await tx.paymentEvent.create({ data: { orderCode: order.orderCode, source: "staff", payload: JSON.stringify({ event: "REFUND_DUE", reason: "CANCELLED_BY_STAFF", amount: order.amount, method: order.method }) } });
    }
  });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "booking", title: "Booking cancelled", message: `Your booking on ${b.date} at ${b.startTime} was cancelled by the venue.${reason ? " " + reason : ""}`, href: "/book", dedupeKey: `booking-staff-cancel-${b.id}` });
  await audit(req, "cancel", "booking", b.id, { reason });
  send(res, null, "Booking cancelled");
}));

bookingsRouter.post("/:id/complete", requirePermission("bookings.complete"), handler(async (req, res) => {
  const b = await load(param(req, "id"));
  if (!["pending", "confirmed"].includes(b.status)) throw new AppError(409, `Only pending or confirmed bookings can be completed (this one is ${b.status})`);
  if (b.date > todayKey()) throw new AppError(400, "A future booking cannot be completed yet");
  const done = await prisma.booking.update({ where: { id: b.id }, data: { status: "completed" } });
  const awarded = await awardForCompletedBooking(done);
  await audit(req, "complete", "booking", b.id, { pointsAwarded: awarded });
  send(res, { booking: withCode(done), pointsAwarded: awarded }, "Booking completed");
}));

bookingsRouter.post("/:id/no-show", requirePermission("bookings.noshow"), handler(async (req, res) => {
  const b = await load(param(req, "id"));
  if (!["pending", "confirmed"].includes(b.status)) throw new AppError(409, `This booking is ${b.status}`);
  if (b.date > todayKey()) throw new AppError(400, "A future booking cannot be a no-show");
  const upd = await prisma.booking.update({ where: { id: b.id }, data: { status: "no_show" } });
  await audit(req, "no-show", "booking", b.id);
  send(res, withCode(upd), "Marked as no-show");
}));

// Money collected at the venue (or confirmed by staff) for a booking.
bookingsRouter.post("/:id/mark-paid", requirePermission("payments.collect"), handler(async (req, res) => {
  const { method, fonepayQrId } = parse(z.object({ method: z.enum(["venue", "fonepay"]).default("venue"), fonepayQrId: z.string().min(1).optional() }), req.body ?? {});
  const b = await load(param(req, "id"));
  if (b.status === "cancelled") throw new AppError(409, "This booking is cancelled");
  if (b.paymentStatus === "completed") throw new AppError(409, "Already paid");
  const total = b.totalPrice;
  await prisma.$transaction(async (tx) => {
    // a Fonepay payment must be backed by a QR the gateway marked paid, for exactly this amount
    if (method === "fonepay") await claimFonepay(tx, { fonepayQrId }, [{ method: "fonepay", amount: Math.round(total) }], b.code ?? b.id);
    await tx.booking.update({
      where: { id: b.id },
      data: { paymentStatus: "completed", status: b.status === "pending" ? "confirmed" : b.status, holdExpiresAt: null, paymentMethod: method, amountPaidNow: total, remainingAmount: 0, cashAmount: method === "venue" ? total : b.cashAmount, onlineAmount: method === "venue" ? b.onlineAmount : total },
    });
    if (b.paymentOrderCode) {
      await tx.paymentOrder.updateMany({ where: { orderCode: b.paymentOrderCode, status: { in: ["pending", "expired"] } }, data: { status: "paid", paidAt: new Date(), paidBy: req.staff!.id } });
      await tx.paymentEvent.create({ data: { orderCode: b.paymentOrderCode, source: "staff", payload: JSON.stringify({ event: "MARKED_PAID", by: req.staff!.id, method }) } });
    }
  });
  const fresh = await load(b.id);
  if (fresh.status === "completed") await awardForCompletedBooking(fresh);
  await audit(req, "mark-paid", "booking", b.id, { method, total });
  send(res, withCode(fresh), "Marked as paid");
}));

// Goals and assists for a game that has started.
bookingsRouter.put("/:id/player-stats", requirePermission("bookings.stats"), handler(async (req, res) => {
  const { stats } = parse(z.object({ stats: z.array(z.object({ phone: z.string().regex(/^9\d{9}$/), goals: z.number().int().min(0).max(50), assists: z.number().int().min(0).max(50) })).max(30) }), req.body);
  const b = await load(param(req, "id"));
  if (b.date > todayKey()) throw new AppError(400, "The game has not started yet");
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: stats.map((s) => s.phone) } }, select: { phoneNumber: true } });
  const known = new Set(users.map((u) => u.phoneNumber));
  const missing = stats.filter((s) => !known.has(s.phone)).map((s) => s.phone);
  if (missing.length) throw new AppError(400, `Not registered players: ${missing.join(", ")}`);
  await prisma.$transaction(stats.map((s) => prisma.playerGameStat.upsert({
    where: { bookingId_userId: { bookingId: b.id, userId: s.phone } },
    update: { goals: s.goals, assists: s.assists, recordedBy: req.staff!.id },
    create: { bookingId: b.id, userId: s.phone, goals: s.goals, assists: s.assists, recordedBy: req.staff!.id },
  })));
  await audit(req, "player-stats", "booking", b.id, { players: stats.length });
  send(res, null, "Stats saved");
}));
