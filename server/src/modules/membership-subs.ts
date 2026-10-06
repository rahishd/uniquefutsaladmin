// Membership subscriptions: who is a member, for which plan, shift, hour and weekdays, from when to when, and whether it is paid.
// Follows FRD-001 sections 25 to 27: a Membership ID (MEM-10291), a status (active, expiring soon, expired, suspended), payment
// verification before activation, renewal, and notices (activated, expiring, expired).
// A membership holds its hour on its weekdays for the whole period (the customer app blocks the hour for others; lib/member-holds.ts does it here).
import { Prisma } from "@prisma/client";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify } from "../lib/customer-effects";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send } from "../lib/http";
import { WEEKDAYS, keyOf, memberHolds, weekdayOf } from "../lib/member-holds";
import { PAY_METHODS, Pay, claimFonepay, paysSchema, resolvePays } from "../lib/settle";
import { requirePermission } from "../middleware/auth";
import { Length, LENGTHS, SHIFTS, Shift, priceCol, discountCol } from "./membership-plans";

export const membershipSubsRouter = Router();

const DAYS: Record<Length, number> = { "1_month": 30, "3_months": 90, "6_months": 180 };
const POINTS: Record<Length, number> = { "1_month": 0, "3_months": 30, "6_months": 70 };
const EXPIRING_DAYS = 15; // "Expiring soon" and the reminder notice start this many days before the end
const PEAK_HOURS = [16, 17, 18, 19]; // 4 PM to 8 PM is reserved for ordinary bookings

export const shiftOf = (hour: number): Shift => (hour < 12 ? "morning" : hour < 20 ? "day" : "evening");
const slotHour = (slot: string) => Number(slot.slice(0, 2));
const slotName = (h: number) => `${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`;
const fmtDate = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const payInput = z.object({ payments: paysSchema.optional(), single: z.enum(PAY_METHODS).optional(), fonepayQrId: z.string().optional() });
type PayIn = z.infer<typeof payInput>;

// ---------- status ----------
export type MStatus = "pending" | "active" | "expiring" | "expired" | "suspended" | "cancelled";
export function statusOf(s: { status: string; endDate: Date }, today = todayKey()): MStatus {
  if (s.status === "suspended" || s.status === "cancelled" || s.status === "pending") return s.status;
  const end = keyOf(s.endDate);
  if (end < today) return "expired";
  return end <= addDaysKey(today, EXPIRING_DAYS) ? "expiring" : "active";
}
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

// ---------- price ----------
async function priceFor(planId: string, shift: Shift, length: Length) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new AppError(404, "That plan was not found or is not active");
  const rec = plan as unknown as Record<string, number | null>;
  const price = rec[priceCol(shift, length)];
  if (price === null || price === undefined) throw new AppError(409, `${plan.name} is not offered for ${shift} / ${length.replace("_", " ")}`);
  const discount = rec[discountCol(shift, length)] ?? 0;
  return { plan, price, discount, total: Math.max(0, price - discount) };
}

// ---------- the hour must be free on every chosen weekday of the period ----------
async function conflicts(a: { timeSlot: string; days: string[]; start: string; end: string; exceptUserId?: string }) {
  const hour = slotHour(a.timeSlot);
  const dates: string[] = [];
  for (let d = a.start; d <= a.end; d = addDaysKey(d, 1)) if (a.days.length === 0 || a.days.includes(weekdayOf(d))) dates.push(d);
  const out: { date: string; reason: string }[] = [];
  const slots = await prisma.bookingSlot.findMany({ where: { date: { in: dates }, hour }, select: { date: true, bookingId: true } });
  for (const s of slots) out.push({ date: s.date, reason: s.bookingId.startsWith("block:") ? "blocked by staff" : "already booked" });
  for (const h of await memberHolds(dates, [hour], a.exceptUserId)) out.push({ date: h.date, reason: `held by member ${h.name ?? h.userId}` });
  return { dates: dates.length, clashes: out.sort((x, y) => x.date.localeCompare(y.date)) };
}

// ---------- member code ----------
async function nextMemberCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.membershipSubscription.findFirst({ where: { memberCode: { startsWith: "MEM-" } }, orderBy: { memberCode: "desc" }, select: { memberCode: true } });
  const n = last?.memberCode ? Number(last.memberCode.slice(4)) + 1 : 10001;
  return `MEM-${n}`;
}

// ---------- money ----------
// Records a payment for a membership as a ledger row (the same kind the customer backend writes) so it is counted and can be traced.
async function recordPayment(tx: Prisma.TransactionClient, s: { id: string; userId: string; timeSlot: string | null }, planName: string, total: number, pays: Pay[], renewal: boolean) {
  const user = await tx.user.findUnique({ where: { phoneNumber: s.userId }, select: { name: true, email: true, phoneNumber: true } });
  const cash = pays.filter((p) => p.method === "cash").reduce((t, p) => t + p.amount, 0);
  const online = total - cash;
  await tx.booking.create({
    data: {
      userId: s.userId, customerName: user?.name ?? null, customerPhone: s.userId, customerEmail: user?.email ?? null, date: todayKey(),
      startTime: s.timeSlot?.slice(0, 5) ?? "00:00", endTime: s.timeSlot?.slice(6) ?? "01:00", duration: 1, basePrice: total, subtotal: total, totalPrice: total,
      amountPaidNow: total, remainingAmount: 0, cashAmount: cash, onlineAmount: online, paymentMethod: cash >= online ? "venue" : "fonepay",
      paymentStatus: "completed", status: "confirmed", notes: `MEMBERSHIP_PAYMENT: ${planName}${renewal ? " (renewal)" : ""}\nMEMBERSHIP_SUB:${s.id}`,
    },
  });
}

async function pointsFor(s: { id: string; userId: string }, length: Length, sourceId: string, renewal: boolean) {
  const pts = POINTS[length];
  if (!pts) return 0;
  const done = await awardPoints({ userId: s.userId, kind: "membership", points: pts, sourceType: "membership", sourceId, detail: `${renewal ? "Membership renewed" : "Membership purchased"} (${length === "6_months" ? "6" : "3"}-month plan bonus)` });
  return done ? pts : 0;
}

// ---------- views ----------
type Sub = Prisma.MembershipSubscriptionGetPayload<{ include: { plan: true; user: { select: { name: true; phoneNumber: true } } } }>;
const include = { plan: true, user: { select: { name: true, phoneNumber: true } } } as const;

function view(s: Sub, today = todayKey(), gamesPlayed?: number) {
  const status = statusOf(s, today);
  const slot = s.timeSlot;
  return {
    id: s.id, memberCode: s.memberCode, status, rawStatus: s.status, paymentStatus: s.paymentStatus,
    customer: { phone: s.userId, name: s.user.name },
    plan: { id: s.planId, name: s.plan.name },
    length: s.chosenDuration, shift: slot ? shiftOf(slotHour(slot)) : null, timeSlot: slot, days: s.chosenDays,
    startDate: keyOf(s.startDate), endDate: keyOf(s.endDate), daysLeft: status === "pending" ? null : daysBetween(today, keyOf(s.endDate)),
    totalPrice: s.totalPrice ?? 0, promoCode: s.promoCode, notes: s.notes, paymentVerifiedAt: s.paymentVerifiedAt, createdAt: s.createdAt,
    ...(gamesPlayed === undefined ? {} : { gamesPlayed }),
  };
}

async function games(s: Sub) {
  return prisma.booking.count({
    where: { userId: s.userId, status: "completed", date: { gte: keyOf(s.startDate), lte: keyOf(s.endDate) }, NOT: { notes: { contains: "MEMBERSHIP_PAYMENT" } } },
  });
}

// ---------- expiry notices (safe to run any number of times) ----------
export async function sweep(today = todayKey()) {
  const live = await prisma.membershipSubscription.findMany({ where: { status: "active" }, include });
  for (const s of live) {
    const end = keyOf(s.endDate);
    const code = s.memberCode ?? s.id;
    if (end < today) {
      await prisma.membershipSubscription.updateMany({ where: { id: s.id, status: "active" }, data: { status: "expired" } });
      await notify(prisma, { userId: s.userId, type: "membership", title: "Membership expired", message: `Your ${s.plan.name} membership ended on ${fmtDate(end)}. Renew to keep your slot.`, href: "/member", dedupeKey: `member-expired-${s.id}-${end}` });
    } else if (end <= addDaysKey(today, EXPIRING_DAYS)) {
      await notify(prisma, { userId: s.userId, type: "membership", title: "Membership expiring soon", message: `Your ${s.plan.name} membership (${code}) ends on ${fmtDate(end)}. Ask staff to renew it.`, href: "/member", dedupeKey: `member-expiring-${s.id}-${end}` });
    }
  }
}

// ---------- list ----------
const FILTERS = ["pending", "active", "expiring", "expired", "suspended", "cancelled"] as const;

membershipSubsRouter.get("/subscriptions", requirePermission("membership.view"), handler(async (req, res) => {
  await sweep();
  const today = todayKey();
  const status = FILTERS.find((f) => f === req.query.status);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const all = await prisma.membershipSubscription.findMany({
    where: q ? { OR: [{ memberCode: { contains: q, mode: "insensitive" } }, { userId: { contains: q } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {},
    include, orderBy: { createdAt: "desc" },
  });
  const counts: Record<string, number> = { all: all.length, pending: 0, active: 0, expiring: 0, expired: 0, suspended: 0, cancelled: 0 };
  let revenue = 0;
  for (const s of all) {
    const st = statusOf(s, today);
    counts[st]++;
    if (st === "active" || st === "expiring") revenue += s.totalPrice ?? 0;
  }
  const rows = status ? all.filter((s) => statusOf(s, today) === status) : all;
  const { take, skip, pageNo, limit } = page(req.query);
  const slice = rows.slice(skip, skip + take);
  const played = await Promise.all(slice.map(games));
  send(res, { items: slice.map((s, i) => view(s, today, played[i])), total: rows.length, page: pageNo, limit, counts, activeValue: revenue });
}));

membershipSubsRouter.get("/subscriptions/:id", requirePermission("membership.view"), handler(async (req, res) => {
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, include });
  if (!s) throw new AppError(404, "Membership not found");
  const [earlier, ledger] = await Promise.all([
    prisma.membershipSubscription.findMany({ where: { userId: s.userId, id: { not: s.id } }, include, orderBy: { startDate: "desc" }, take: 10 }),
    prisma.booking.findMany({ where: { notes: { contains: `MEMBERSHIP_SUB:${s.id}` } }, orderBy: { createdAt: "asc" }, select: { id: true, date: true, totalPrice: true, cashAmount: true, onlineAmount: true, notes: true, paymentStatus: true } }),
  ]);
  send(res, { ...view(s, todayKey(), await games(s)), earlier: earlier.map((e) => view(e)), payments: ledger.map((l) => ({ id: l.id, date: l.date, amount: l.totalPrice, cash: l.cashAmount, online: l.onlineAmount, renewal: !!l.notes?.includes("(renewal)"), status: l.paymentStatus })) });
}));

// ---------- check a plan, shift and hour before making the membership ----------
const createBody = z.object({
  phone: z.string().regex(/^9\d{9}$/, "mobile number like 98XXXXXXXX"),
  planId: z.string().min(1),
  length: z.enum(LENGTHS),
  timeSlot: z.string().regex(/^([01]\d|2[0-3]):00-([01]\d|2[0-3]|24):00$/, "use HH:00-HH:00"),
  days: z.array(z.enum(WEEKDAYS)).min(1, "Choose at least one day").max(7),
  startDate: dateStr,
  notes: z.string().trim().max(300).optional(),
  pay: payInput.optional(), // leave out: the membership waits as "pending" until payment is verified
  dryRun: z.boolean().default(false),
});

function checkSlot(timeSlot: string) {
  const h = slotHour(timeSlot);
  if (timeSlot !== slotName(h)) throw new AppError(400, "A membership hour is one hour, like 07:00-08:00");
  if (PEAK_HOURS.includes(h)) throw new AppError(409, "4 PM to 8 PM is kept for ordinary bookings and cannot be a membership hour");
  return h;
}

membershipSubsRouter.post("/subscriptions", requirePermission("membership.create"), handler(async (req, res) => {
  const b = parse(createBody, req.body);
  const today = todayKey();
  if (b.startDate < today) throw new AppError(400, "The start date cannot be in the past");
  if (b.startDate > addDaysKey(today, 120)) throw new AppError(400, "Pick a start date within 120 days");
  const hour = checkSlot(b.timeSlot);
  const user = await prisma.user.findUnique({ where: { phoneNumber: b.phone }, select: { phoneNumber: true, name: true, isActive: true } });
  if (!user) throw new AppError(404, "This number is not a registered customer. Ask them to sign up in the app first.");
  if (!user.isActive) throw new AppError(409, "This customer is suspended");
  const current = await prisma.membershipSubscription.findMany({ where: { userId: b.phone, status: { in: ["active", "pending", "suspended"] } } });
  if (current.some((s) => statusOf(s, today) !== "expired")) throw new AppError(409, "This customer already has a membership. Renew or change that one instead.");

  const quote = await priceFor(b.planId, shiftOf(hour), b.length);
  const end = addDaysKey(b.startDate, DAYS[b.length]);
  const check = await conflicts({ timeSlot: b.timeSlot, days: b.days, start: b.startDate, end });
  if (b.dryRun) return send(res, { price: quote.price, discount: quote.discount, total: quote.total, shift: shiftOf(hour), startDate: b.startDate, endDate: end, ...check });
  if (check.clashes.length) throw new AppError(409, `That hour is not free on ${check.clashes.length} of the chosen days (first: ${fmtDate(check.clashes[0].date)}, ${check.clashes[0].reason})`);

  const pays = b.pay ? resolvePays(b.pay, quote.total) : null;
  let created: Sub;
  let pts = 0;
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.membershipSubscription.create({
        data: {
          planId: b.planId, userId: b.phone, startDate: new Date(`${b.startDate}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`),
          status: pays ? "active" : "pending", paymentStatus: pays ? "verified" : "pending", paymentVerifiedAt: pays ? new Date() : null, paymentVerifiedBy: pays ? req.staff!.id : null,
          timeSlot: b.timeSlot, chosenCategory: shiftOf(hour), chosenDuration: b.length, totalPrice: quote.total, discountAmount: quote.discount, chosenDays: b.days, excludeDays: [], notes: b.notes ?? null,
          memberCode: await nextMemberCode(tx),
        },
        include,
      });
      if (pays) { await claimFonepay(tx, b.pay!, pays, `membership:${row.id}`); await recordPayment(tx, row, row.plan.name, quote.total, pays, false); }
      return row;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "Another membership was made at the same moment. Try again.");
    throw e;
  }
  if (pays) {
    pts = await pointsFor(created, b.length, created.id, false);
    await notify(prisma, { userId: b.phone, type: "membership", title: "Membership active", message: `Your ${created.plan.name} membership ${created.memberCode} is active until ${fmtDate(end)}.`, href: "/member", dedupeKey: `member-active-${created.id}` });
  }
  await audit(req, "create", "membership", created.id, { code: created.memberCode, phone: b.phone, plan: created.plan.name, length: b.length, slot: b.timeSlot, days: b.days, total: quote.total, paid: !!pays });
  send(res, { ...view(created), pointsAdded: pts }, pays ? "Membership activated" : "Membership saved, waiting for payment", 201);
}));

// ---------- verify payment (activates a pending membership) ----------
membershipSubsRouter.post("/subscriptions/:id/verify", requirePermission("membership.edit"), handler(async (req, res) => {
  const pay = parse(payInput, req.body);
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, include });
  if (!s) throw new AppError(404, "Membership not found");
  if (s.status !== "pending" || s.paymentStatus === "verified") throw new AppError(409, "This membership is already paid");
  const total = s.totalPrice ?? 0;
  if (total <= 0) throw new AppError(409, "This membership has no price to collect");
  const hour = s.timeSlot ? slotHour(s.timeSlot) : null;
  // the slot must still be free if the start date is today or later (someone may have booked it while this waited)
  if (s.timeSlot && keyOf(s.endDate) >= todayKey()) {
    const check = await conflicts({ timeSlot: s.timeSlot, days: s.chosenDays, start: keyOf(s.startDate) < todayKey() ? todayKey() : keyOf(s.startDate), end: keyOf(s.endDate), exceptUserId: s.userId });
    if (check.clashes.length) throw new AppError(409, `The hour is no longer free on ${check.clashes.length} days (first: ${fmtDate(check.clashes[0].date)}, ${check.clashes[0].reason})`);
  }
  const pays = resolvePays(pay, total);
  const done = await prisma.$transaction(async (tx) => {
    const flip = await tx.membershipSubscription.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "active", paymentStatus: "verified", paymentVerifiedAt: new Date(), paymentVerifiedBy: req.staff!.id, memberCode: s.memberCode ?? (await nextMemberCode(tx)) } });
    if (flip.count === 0) throw new AppError(409, "This membership was just verified by someone else");
    await claimFonepay(tx, pay, pays, `membership:${s.id}`);
    await recordPayment(tx, s, s.plan.name, total, pays, false);
    return tx.membershipSubscription.findUniqueOrThrow({ where: { id: s.id }, include });
  });
  const pts = await pointsFor(done, (done.chosenDuration as Length) ?? "1_month", done.id, false);
  await notify(prisma, { userId: done.userId, type: "membership", title: "Membership active", message: `Your ${done.plan.name} membership ${done.memberCode} is active until ${fmtDate(keyOf(done.endDate))}.`, href: "/member", dedupeKey: `member-active-${done.id}` });
  await audit(req, "verify-payment", "membership", done.id, { code: done.memberCode, total, payments: pays, hour });
  send(res, { ...view(done), pointsAdded: pts }, "Payment verified, membership active");
}));

// ---------- renew: another period, paid now ----------
const renewBody = z.object({ length: z.enum(LENGTHS).optional(), pay: payInput });
membershipSubsRouter.post("/subscriptions/:id/renew", requirePermission("membership.edit"), handler(async (req, res) => {
  const b = parse(renewBody, req.body);
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, include });
  if (!s || !s.timeSlot) throw new AppError(404, "Membership not found");
  const st = statusOf(s);
  if (st === "pending" || st === "suspended" || st === "cancelled") throw new AppError(409, st === "pending" ? "Verify the payment first" : `A ${st} membership cannot be renewed`);
  const length = b.length ?? ((s.chosenDuration as Length) ?? "1_month");
  const hour = slotHour(s.timeSlot);
  const quote = await priceFor(s.planId, shiftOf(hour), length);
  const today = todayKey();
  const base = keyOf(s.endDate) >= today ? keyOf(s.endDate) : today; // continue after the end, or start today if it already ended
  const end = addDaysKey(base, DAYS[length]);
  const check = await conflicts({ timeSlot: s.timeSlot, days: s.chosenDays, start: addDaysKey(base, 1), end, exceptUserId: s.userId });
  if (check.clashes.length) throw new AppError(409, `The hour is not free on ${check.clashes.length} days of the new period (first: ${fmtDate(check.clashes[0].date)}, ${check.clashes[0].reason})`);
  const pays = resolvePays(b.pay, quote.total);
  const done = await prisma.$transaction(async (tx) => {
    await claimFonepay(tx, b.pay, pays, `membership-renew:${s.id}`);
    await recordPayment(tx, s, s.plan.name, quote.total, pays, true);
    return tx.membershipSubscription.update({
      where: { id: s.id },
      data: { endDate: new Date(`${end}T00:00:00Z`), status: "active", paymentStatus: "verified", chosenDuration: length, totalPrice: (s.totalPrice ?? 0) + quote.total, ...(keyOf(s.endDate) < today ? { startDate: new Date(`${today}T00:00:00Z`) } : {}) },
      include,
    });
  });
  const pts = await pointsFor(done, length, `${done.id}:${end}`, true);
  await notify(prisma, { userId: done.userId, type: "membership", title: "Membership renewed", message: `Your ${done.plan.name} membership ${done.memberCode ?? ""} now runs until ${fmtDate(end)}.`, href: "/member", dedupeKey: `member-renewed-${done.id}-${end}` });
  await audit(req, "renew", "membership", done.id, { code: done.memberCode, length, total: quote.total, payments: pays, until: end });
  send(res, { ...view(done), pointsAdded: pts }, "Membership renewed");
}));

// ---------- extend: free extra days (a tournament week, a closure) ----------
membershipSubsRouter.post("/subscriptions/:id/extend", requirePermission("membership.edit"), handler(async (req, res) => {
  const b = parse(z.object({ days: z.number().int().min(1).max(90), reason: z.string().trim().min(3).max(200) }), req.body);
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, include });
  if (!s) throw new AppError(404, "Membership not found");
  if (s.status !== "active") throw new AppError(409, "Only an active (or just expired) membership can be extended");
  const end = addDaysKey(keyOf(s.endDate), b.days);
  if (s.timeSlot) {
    const check = await conflicts({ timeSlot: s.timeSlot, days: s.chosenDays, start: addDaysKey(keyOf(s.endDate), 1), end, exceptUserId: s.userId });
    if (check.clashes.length) throw new AppError(409, `The hour is not free on ${check.clashes.length} of the extra days (first: ${fmtDate(check.clashes[0].date)}, ${check.clashes[0].reason})`);
  }
  const done = await prisma.membershipSubscription.update({ where: { id: s.id }, data: { endDate: new Date(`${end}T00:00:00Z`), status: "active", notes: [s.notes, `+${b.days} days: ${b.reason}`].filter(Boolean).join("\n") }, include });
  await notify(prisma, { userId: s.userId, type: "membership", title: "Membership extended", message: `Your membership now runs until ${fmtDate(end)} (+${b.days} days: ${b.reason}).`, href: "/member", dedupeKey: `member-extended-${s.id}-${end}` });
  await audit(req, "extend", "membership", s.id, { days: b.days, reason: b.reason, until: end });
  send(res, view(done), `Extended to ${fmtDate(end)}`);
}));

// ---------- suspend, resume, cancel ----------
async function change(req: Request, res: Response, to: "suspended" | "active" | "cancelled") {
  const b = parse(z.object({ reason: z.string().trim().min(3).max(200).optional() }), req.body ?? {});
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, include });
  if (!s) throw new AppError(404, "Membership not found");
  if (to === "suspended" && !["active"].includes(s.status)) throw new AppError(409, "Only an active membership can be suspended");
  if (to === "active" && s.status !== "suspended") throw new AppError(409, "This membership is not suspended");
  if (to === "cancelled" && s.status === "cancelled") throw new AppError(409, "Already cancelled");
  if ((to === "suspended" || to === "cancelled") && !b.reason) throw new AppError(400, "Write a short reason");
  if (to === "active" && s.timeSlot && keyOf(s.endDate) >= todayKey()) {
    const check = await conflicts({ timeSlot: s.timeSlot, days: s.chosenDays, start: todayKey(), end: keyOf(s.endDate), exceptUserId: s.userId });
    if (check.clashes.length) throw new AppError(409, `The hour was taken on ${check.clashes.length} days while this was suspended (first: ${fmtDate(check.clashes[0].date)})`);
  }
  const done = await prisma.membershipSubscription.update({ where: { id: s.id }, data: { status: to, notes: b.reason ? [s.notes, `${to}: ${b.reason}`].filter(Boolean).join("\n") : s.notes }, include });
  const words = { suspended: ["Membership suspended", `Your membership ${s.memberCode ?? ""} is on hold. Please contact the venue.`], active: ["Membership resumed", `Your membership ${s.memberCode ?? ""} is active again.`], cancelled: ["Membership cancelled", `Your membership ${s.memberCode ?? ""} was cancelled. Please contact the venue.`] }[to];
  await notify(prisma, { userId: s.userId, type: "membership", title: words[0], message: words[1], href: "/member", dedupeKey: `member-${to}-${s.id}-${Date.now()}` });
  await audit(req, to === "active" ? "resume" : to === "suspended" ? "suspend" : "cancel", "membership", s.id, { reason: b.reason });
  send(res, view(done), words[0]);
}
membershipSubsRouter.post("/subscriptions/:id/suspend", requirePermission("membership.edit"), handler((req, res) => change(req, res, "suspended")));
membershipSubsRouter.post("/subscriptions/:id/resume", requirePermission("membership.edit"), handler((req, res) => change(req, res, "active")));
membershipSubsRouter.post("/subscriptions/:id/cancel", requirePermission("membership.edit"), handler((req, res) => change(req, res, "cancelled")));

membershipSubsRouter.patch("/subscriptions/:id", requirePermission("membership.edit"), handler(async (req, res) => {
  const b = parse(z.object({ notes: z.string().trim().max(500) }), req.body);
  const s = await prisma.membershipSubscription.findUnique({ where: { id: param(req, "id") }, select: { id: true } });
  if (!s) throw new AppError(404, "Membership not found");
  const done = await prisma.membershipSubscription.update({ where: { id: s.id }, data: { notes: b.notes || null }, include });
  await audit(req, "note", "membership", s.id);
  send(res, view(done), "Saved");
}));
