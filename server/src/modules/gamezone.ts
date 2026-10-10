import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardForGamezone, notify } from "../lib/customer-effects";
import { addDaysKey, currentHour, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { PAY_METHODS, claimFonepay, paysSchema, resolvePays } from "../lib/settle";

export const gamezoneRouter = Router();

// Adds what the screens need next to each session: the console's name, who booked it and whether they tapped "I'm coming".
async function enrich<T extends { code: string; consoleId: string; userId: string | null; guestName: string | null; guestPhone: string | null }>(rows: T[]) {
  const [consoles, users, checkins] = await Promise.all([
    prisma.gzConsole.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { phoneNumber: { in: rows.flatMap((r) => (r.userId ? [r.userId] : [])) } }, select: { phoneNumber: true, name: true } }),
    prisma.arrivalCheckin.findMany({ where: { refId: { in: rows.map((r) => r.code) } }, select: { refId: true, confirmedAt: true } }),
  ]);
  const cn = new Map(consoles.map((c) => [c.id, c.name]));
  const un = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const ck = new Map(checkins.map((c) => [c.refId, c.confirmedAt]));
  return rows.map((r) => ({
    ...r,
    consoleName: cn.get(r.consoleId) ?? "Console",
    customerName: r.guestName ?? (r.userId ? un.get(r.userId) ?? null : null),
    customerPhone: r.guestPhone ?? r.userId,
    registered: Boolean(r.userId),
    checkedInAt: ck.get(r.code) ?? null,
  }));
}

gamezoneRouter.get("/bookings", requirePermission("gamezone.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const today = todayKey();
  const where: Prisma.GzBookingWhereInput = {
    ...(q.date ? { date: q.date } : {}), ...(q.status ? { status: q.status } : {}), ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.scope === "today" ? { date: today } : q.scope === "upcoming" ? { date: { gt: today } } : q.scope === "previous" ? { date: { lt: today } } : {}),
    ...(q.unpaid === "1" ? { status: { in: ["confirmed", "completed"] }, paymentStatus: { in: ["pending", "pay_at_venue"] } } : {}),
    ...(q.q ? { OR: [{ code: { contains: q.q, mode: "insensitive" } }, { guestName: { contains: q.q, mode: "insensitive" } }, { guestPhone: { contains: q.q } }, { userId: { contains: q.q } }] } : {}),
  };
  const asc = q.scope === "upcoming";
  const [rows, total] = await Promise.all([
    prisma.gzBooking.findMany({ where, orderBy: asc ? [{ date: "asc" }, { startHour: "asc" }] : [{ date: "desc" }, { startHour: "desc" }], take, skip }),
    prisma.gzBooking.count({ where }),
  ]);
  send(res, { items: await enrich(rows), total, page: pageNo, limit });
}));

// Registered customers by name or mobile number, for the "book a session" form's suggestions. Kept here (not on the
// Customers page route) so a Gamezone attendant without the Customers permission can still link a session to an account.
gamezoneRouter.get("/customers", requirePermission("gamezone.view"), handler(async (req, res) => {
  const q = String((req.query as Record<string, string | undefined>).q ?? "").trim();
  if (q.length < 2) return send(res, { items: [] });
  const items = await prisma.user.findMany({
    where: { role: "user", isActive: true, OR: [{ name: { contains: q, mode: "insensitive" } }, { phoneNumber: { contains: q } }] },
    select: { phoneNumber: true, name: true }, orderBy: { name: "asc" }, take: 8,
  });
  send(res, { items });
}));

// One day on one screen: every console with its sessions, plus the money for that day.
gamezoneRouter.get("/day", requirePermission("gamezone.view"), handler(async (req, res) => {
  const date = parse(dateStr, (req.query as Record<string, string | undefined>).date ?? todayKey());
  const [consoles, rows] = await Promise.all([
    prisma.gzConsole.findMany({ orderBy: { name: "asc" } }),
    prisma.gzBooking.findMany({ where: { date, status: { not: "expired" } }, orderBy: { startHour: "asc" } }),
  ]);
  const items = await enrich(rows);
  const live = items.filter((i) => i.status !== "cancelled");
  const sum = (xs: typeof live) => xs.reduce((n, x) => n + x.total, 0);
  send(res, {
    date, consoles, items,
    totals: {
      sessions: live.length, hours: live.reduce((n, x) => n + x.hours, 0), cancelled: items.length - live.length,
      paid: sum(live.filter((i) => i.paymentStatus === "paid")), owed: sum(live.filter((i) => i.paymentStatus === "pending" || i.paymentStatus === "pay_at_venue")),
    },
  });
}));

// Staff book a session for someone at the desk or on the phone. The server sets the price from the rates;
// a session whose hours have already passed is logged as completed. Same one-console-one-hour guard as the app.
const manual = z.object({
  consoleId: z.string().min(1), gameTitle: z.string().min(1).max(60), date: dateStr,
  startHour: z.number().int().min(0).max(23), hours: z.number().int().min(1).max(4), players: z.number().int(),
  customerName: z.string().trim().min(2).max(60),
  customerPhone: z.string().regex(/^9\d{9}$/, "mobile number like 98XXXXXXXX").optional(),
  paid: z.boolean().default(false),
});

gamezoneRouter.post("/bookings", requirePermission("gamezone.manage"), handler(async (req, res) => {
  const b = parse(manual, req.body);
  if (b.startHour + b.hours > 24) throw new AppError(400, "The session cannot pass midnight");
  if (b.date < addDaysKey(todayKey(), -60) || b.date > addDaysKey(todayKey(), 60)) throw new AppError(400, "Pick a date within 60 days of today");
  const [plan, con, game, user] = await Promise.all([
    prisma.gzPlan.findUnique({ where: { players: b.players } }),
    prisma.gzConsole.findUnique({ where: { id: b.consoleId } }),
    prisma.gzGame.findFirst({ where: { title: b.gameTitle } }),
    b.customerPhone ? prisma.user.findUnique({ where: { phoneNumber: b.customerPhone }, select: { phoneNumber: true } }) : null,
  ]);
  const rate = plan?.ratePerPersonHour ?? ({ 1: 300, 2: 200, 4: 150 } as Record<number, number>)[b.players]; // the app's defaults until rates are first saved
  if (rate === undefined) throw new AppError(400, "Choose 1, 2 or 4 players");
  if (!con) throw new AppError(404, "Console not found");
  if (!game) throw new AppError(400, "Choose a game from the list");
  const total = rate * b.players * b.hours;
  const code = `UF-GZ-${b.date.replace(/-/g, "")}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
  const ended = b.date < todayKey() || (b.date === todayKey() && b.startHour + b.hours <= currentHour());
  try {
    await prisma.$transaction(async (tx) => {
      await tx.gzBooking.create({
        data: {
          code, userId: user?.phoneNumber ?? null, guestName: user ? null : b.customerName, guestPhone: user ? null : b.customerPhone ?? null,
          consoleId: con.id, gameTitle: game.title, date: b.date, startHour: b.startHour, hours: b.hours, players: b.players, total,
          paymentMethod: "venue", paymentStatus: b.paid ? "paid" : "pay_at_venue", status: ended ? "completed" : "confirmed",
        },
      });
      await tx.gzSlot.createMany({ data: Array.from({ length: b.hours }, (_, i) => ({ consoleId: con.id, date: b.date, hour: b.startHour + i, bookingCode: code })) });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That console is already booked for part of this time");
    throw e;
  }
  await awardForGamezone({ code, userId: user?.phoneNumber ?? null, hours: b.hours, status: ended ? "completed" : "confirmed", paymentStatus: b.paid ? "paid" : "pay_at_venue", date: b.date });
  await audit(req, "create", "gamezone", code, { total, paid: b.paid, date: b.date, startHour: b.startHour, hours: b.hours });
  send(res, { code, total }, "Session booked", 201);
}));

const load = async (code: string) => {
  const b = await prisma.gzBooking.findUnique({ where: { code } });
  if (!b) throw new AppError(404, "Gamezone booking not found");
  return b;
};

// Collected in cash, by Fonepay QR, or part cash and part Fonepay (same rules as a court booking: the Fonepay part must be
// backed by a QR the gateway marked paid for exactly that amount). With no body it is all cash, as before. The session keeps
// the method that paid most of it; the exact split is written to the payment log.
const collectBody = z.object({ payments: paysSchema.optional(), single: z.enum(PAY_METHODS).optional(), fonepayQrId: z.string().min(1).optional() });
gamezoneRouter.post("/bookings/:code/mark-paid", requirePermission("gamezone.collect"), handler(async (req, res) => {
  const body = parse(collectBody, req.body ?? {});
  const b = await load(param(req, "code"));
  if (b.status === "cancelled" || b.status === "expired") throw new AppError(409, `This booking is ${b.status}`);
  if (b.paymentStatus === "paid") throw new AppError(409, "Already paid");
  const input = { payments: body.payments, single: body.payments ? undefined : body.single ?? ("cash" as const), fonepayQrId: body.fonepayQrId };
  const pays = resolvePays(input, b.total);
  const cash = pays.filter((p) => p.method === "cash").reduce((n, p) => n + p.amount, 0);
  const fonepay = b.total - cash;
  await prisma.$transaction(async (tx) => {
    await claimFonepay(tx, input, pays, b.code);
    await tx.gzBooking.update({ where: { code: b.code }, data: { paymentStatus: "paid", holdExpiresAt: null, paymentMethod: cash >= fonepay ? "venue" : "fonepay" } });
    await tx.paymentOrder.updateMany({ where: { orderCode: b.code, status: { in: ["pending", "expired"] } }, data: { status: "paid", paidAt: new Date(), paidBy: req.staff!.id } });
    await tx.paymentEvent.create({ data: { orderCode: b.code, source: "staff", payload: JSON.stringify({ event: "MARKED_PAID", by: req.staff!.id, cash, fonepay }) } });
  });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Payment received", message: `Rs. ${b.total} for your Gamezone session ${b.code} was received.`, href: "/gamezone", dedupeKey: `gz-paid-${b.code}` });
  await awardForGamezone({ ...b, paymentStatus: "paid" }); // 5 points per hour, once the session is also completed
  await audit(req, "mark-paid", "gamezone", b.code, { total: b.total, cash, fonepay });
  send(res, null, "Marked as paid");
}));

gamezoneRouter.post("/bookings/:code/complete", requirePermission("gamezone.manage"), handler(async (req, res) => {
  const b = await load(param(req, "code"));
  if (b.status !== "confirmed") throw new AppError(409, `Only confirmed sessions can be completed (this one is ${b.status})`);
  await prisma.gzBooking.update({ where: { code: b.code }, data: { status: "completed" } });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Thanks for playing", message: `Your Gamezone session ${b.code} is complete. See you again soon!`, href: "/gamezone", dedupeKey: `gz-done-${b.code}` });
  await awardForGamezone({ ...b, status: "completed" }); // 5 points per hour, once the session is also paid
  await audit(req, "complete", "gamezone", b.code);
  send(res, null, "Session completed");
}));

gamezoneRouter.post("/bookings/:code/cancel", requirePermission("gamezone.manage"), handler(async (req, res) => {
  const b = await load(param(req, "code"));
  if (b.status === "cancelled" || b.status === "completed") throw new AppError(409, `This booking is ${b.status}`);
  await prisma.$transaction(async (tx) => {
    await tx.gzBooking.update({ where: { code: b.code }, data: { status: "cancelled", paymentStatus: b.paymentStatus === "paid" ? "refunded" : b.paymentStatus, holdExpiresAt: null } });
    await tx.gzSlot.deleteMany({ where: { bookingCode: b.code } });
    const order = await tx.paymentOrder.findUnique({ where: { orderCode: b.code } });
    if (order?.status === "paid") {
      await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "refunded" } });
      await tx.paymentEvent.create({ data: { orderCode: b.code, source: "staff", payload: JSON.stringify({ event: "REFUND_DUE", reason: "CANCELLED_BY_STAFF", amount: order.amount, method: order.method }) } });
    }
  });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Gamezone session cancelled", message: `Your Gamezone session ${b.code} was cancelled by the venue.${b.paymentStatus === "paid" ? " Your payment will be refunded." : ""}`, href: "/gamezone", dedupeKey: `gz-cancel-${b.code}` });
  await audit(req, "cancel", "gamezone", b.code);
  send(res, null, "Session cancelled");
}));

// ---- catalog: consoles, games, plans (rates) ----
gamezoneRouter.get("/catalog", requirePermission("gamezone.view"), handler(async (_req, res) => {
  const [consoles, games, plans] = await Promise.all([prisma.gzConsole.findMany({ orderBy: { name: "asc" } }), prisma.gzGame.findMany({ orderBy: { title: "asc" } }), prisma.gzPlan.findMany({ orderBy: { players: "asc" } })]);
  send(res, { consoles, games, plans });
}));

const name = z.string().trim().min(2).max(40);
const dup = (e: unknown) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That name already exists"); throw e; };

gamezoneRouter.post("/consoles", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ name }), req.body);
  const row = await prisma.gzConsole.create({ data: { name: b.name } }).catch(dup);
  await audit(req, "create", "gz-console", row.id, b);
  send(res, row, "Console added", 201);
}));
gamezoneRouter.patch("/consoles/:id", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ name: name.optional(), active: z.boolean().optional() }), req.body);
  const id = param(req, "id");
  const row = await prisma.gzConsole.update({ where: { id }, data: b }).catch((e) => { if (e?.code === "P2025") throw new AppError(404, "Console not found"); return dup(e); });
  await audit(req, "update", "gz-console", id, b);
  send(res, row, "Console saved");
}));

gamezoneRouter.post("/games", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ title: name }), req.body);
  const row = await prisma.gzGame.create({ data: { title: b.title } }).catch(dup);
  await audit(req, "create", "gz-game", row.id, b);
  send(res, row, "Game added", 201);
}));
gamezoneRouter.patch("/games/:id", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ title: name.optional(), active: z.boolean().optional() }), req.body);
  const id = param(req, "id");
  const row = await prisma.gzGame.update({ where: { id }, data: b }).catch((e) => { if (e?.code === "P2025") throw new AppError(404, "Game not found"); return dup(e); });
  await audit(req, "update", "gz-game", id, b);
  send(res, row, "Game saved");
}));

// Rate per person per hour for 1, 2 or 4 players. Customers pay rate x players x hours, computed on the server.
gamezoneRouter.put("/plans/:players", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const players = parse(z.coerce.number().int().refine((n) => [1, 2, 4].includes(n), "1, 2 or 4"), param(req, "players"));
  const b = parse(z.object({ label: z.string().min(2).max(30), ratePerPersonHour: z.number().int().min(0).max(100000) }), req.body);
  const row = await prisma.gzPlan.upsert({ where: { players }, update: b, create: { players, ...b } });
  await audit(req, "update", "gz-plan", String(players), b);
  send(res, row, "Plan saved");
}));
