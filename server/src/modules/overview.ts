// Dashboard numbers, arrivals, notices, reports and the audit log.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { pushEnabled, pushToUsers } from "../lib/push";
import { buildReport } from "./inventory-report";

export const overviewRouter = Router();

overviewRouter.get("/dashboard", requirePermission("dashboard.view"), handler(async (_req, res) => {
  const today = todayKey();
  const live = { status: { notIn: ["cancelled", "expired"] } };
  const [bookingsToday, paidToday, gzPaidToday, pendingPayments, disputes, refundOrders, arrivals, newCustomers] = await Promise.all([
    prisma.booking.count({ where: { date: today, ...live } }),
    prisma.booking.aggregate({ where: { date: today, paymentStatus: "completed", ...live }, _sum: { totalPrice: true } }),
    prisma.gzBooking.aggregate({ where: { date: today, paymentStatus: "paid", ...live }, _sum: { total: true } }),
    prisma.paymentOrder.count({ where: { status: "pending", expiresAt: { gt: new Date() } } }),
    prisma.challengeResult.count({ where: { status: "disputed" } }),
    prisma.paymentOrder.findMany({ where: { status: "refunded" }, select: { orderCode: true } }),
    prisma.booking.findMany({ where: { date: today, ...live }, select: { id: true } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(`${today}T00:00:00+05:45`) }, role: "user" } }),
  ]);
  const paidRefunds = await prisma.paymentEvent.findMany({ where: { orderCode: { in: refundOrders.map((o) => o.orderCode) }, payload: { contains: "REFUND_PAID" } }, select: { orderCode: true } });
  const checkins = await prisma.arrivalCheckin.count({ where: { refId: { in: arrivals.map((a) => a.id) } } });
  send(res, {
    date: today, bookingsToday, revenueToday: (paidToday._sum.totalPrice ?? 0) + (gzPaidToday._sum.total ?? 0),
    pendingPayments, disputes, refundsDue: refundOrders.length - new Set(paidRefunds.map((e) => e.orderCode)).size, arrivalsToday: checkins, newCustomers,
  });
}));

// ---- overview: one screen for the day (money, what needs attention, the next games, a week of sales) ----
const sales = (r: Awaited<ReturnType<typeof buildReport>>) => ({ cash: r.totals.cash, fonepay: r.totals.fonepay, total: r.totals.total });

// from / to (Nepal dates) pick the period: Today, Yesterday or any range of up to 93 days. It is compared with the period just before it.
overviewRouter.get("/overview", requirePermission("dashboard.view"), handler(async (req, res) => {
  const today = todayKey();
  const q = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
  const from = q.from ?? q.to ?? today;
  const to = q.to ?? from;
  if (from > to) throw new AppError(400, "The From date must not be after the To date");
  if (to > today) throw new AppError(400, "Pick dates up to today");
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  if (days > 93 || from < addDaysKey(today, -366)) throw new AppError(400, "Pick at most 93 days, within the last year");
  const [t, y] = await Promise.all([buildReport(from, to), buildReport(addDaysKey(from, -days), addDaysKey(from, -1))]);
  const week = await Promise.all(Array.from({ length: 7 }, (_, i) => addDaysKey(to, i - 6)).map(async (d) => ({ date: d, ...sales(await buildReport(d, d)) })));
  const live = { status: { notIn: ["cancelled", "expired", "cancelled_due_to_tournament", "skipped_due_to_tournament"] } };
  const nowKey = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const visitRange = (a: string, b: string) => prisma.siteVisit.aggregate({ where: { day: { gte: a, lte: b } }, _count: { _all: true }, _sum: { pages: true } });
  const [next, dues, products, pendingMembers, subs, complaints, referrals, unpaidToday, disputes, newCustomers, visitNow, visitPrev, visitSignedIn] = await Promise.all([
    prisma.booking.findMany({ where: { date: today, startTime: { gte: nowKey }, OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }], ...live }, orderBy: { startTime: "asc" }, take: 6, select: { id: true, code: true, startTime: true, customerName: true, totalPrice: true, paymentStatus: true } }),
    prisma.goodsDue.aggregate({ where: { status: "due" }, _sum: { amount: true }, _count: true }),
    prisma.product.findMany({ select: { inventory: true, lowStockThreshold: true } }),
    prisma.membershipSubscription.count({ where: { status: "pending" } }),
    prisma.membershipSubscription.findMany({ where: { status: "active" }, select: { endDate: true } }),
    prisma.complaint.count({ where: { status: { in: ["open", "in_review"] } } }),
    prisma.referral.count({ where: { status: "pending" } }),
    prisma.booking.count({ where: { date: today, paymentStatus: { not: "completed" }, OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }], ...live } }),
    prisma.challengeResult.count({ where: { status: "disputed" } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(`${today}T00:00:00+05:45`) }, role: "user" } }),
    visitRange(from, to),
    visitRange(addDaysKey(from, -days), addDaysKey(from, -1)),
    prisma.siteVisit.count({ where: { day: { gte: from, lte: to }, registered: true } }),
  ]);
  const soon = addDaysKey(today, 15);
  const expiring = subs.filter((x) => { const e = x.endDate.toISOString().slice(0, 10); return e >= today && e <= soon; }).length;
  send(res, {
    date: today, from, to, days, today: sales(t), yesterday: sales(y), week,
    bySource: t.totals.bySource,
    games: { count: t.games.count, paid: t.games.paidCount, unpaid: unpaidToday }, gamezone: t.gamezone.count, itemsSold: t.itemsSold.reduce((n, i) => n + i.qty, 0), newCustomers,
    attention: {
      unpaidGamesToday: unpaidToday, goodsDue: { amount: dues._sum.amount ?? 0, count: dues._count }, lowStock: products.filter((p) => p.inventory <= p.lowStockThreshold).length,
      membersWaiting: pendingMembers, membersExpiring: expiring, openComplaints: complaints, pendingReferrals: referrals, disputes,
    },
    // Website visits: one visitor counts once per day, so a range adds the daily counts together
    visits: { visitors: visitNow._count._all, pageViews: visitNow._sum.pages ?? 0, signedIn: visitSignedIn, previous: visitPrev._count._all },
    nextGames: next,
  });
}));

// ---- broadcast ----
const AUDIENCE = z.enum(["all", "captains", "customer"]);
type Aud = { type: string; audience: z.infer<typeof AUDIENCE>; phone?: string };

// Who would get this notice: active customers, minus promo opt-outs, narrowed to captains or one customer.
async function recipients(b: Aud) {
  const prefs = b.type === "promo" ? await prisma.userPrefs.findMany({ where: { promoNotifications: false }, select: { userId: true } }) : [];
  const optedOut = new Set(prefs.map((p) => p.userId));
  const captains = b.audience === "captains" ? new Set((await prisma.team.findMany({ select: { captainId: true } })).map((t) => t.captainId)) : null;
  const users = await prisma.user.findMany({ where: { role: "user", isActive: true, ...(b.audience === "customer" ? { phoneNumber: b.phone ?? "" } : {}) }, select: { phoneNumber: true } });
  const all = users.map((u) => u.phoneNumber);
  return { targets: all.filter((p) => !optedOut.has(p) && (!captains || captains.has(p))), optedOut: all.filter((p) => optedOut.has(p)).length };
}

// How many customers a notice would reach (shown before staff press Send).
overviewRouter.get("/notifications/reach", requirePermission("notifications.send"), handler(async (req, res) => {
  const q = parse(z.object({ type: z.enum(["promo", "tournament", "general"]).default("general"), audience: AUDIENCE.default("all"), phone: z.string().regex(/^\d{10}$/).optional() }), req.query);
  if (q.audience === "customer" && !q.phone) return send(res, { reach: 0, skippedOptOut: 0 });
  const r = await recipients(q);
  send(res, { reach: r.targets.length, skippedOptOut: r.optedOut });
}));

// Notices staff sent, newest first, with how many customers opened them.
overviewRouter.get("/notifications/history", requirePermission("notifications.send"), handler(async (_req, res) => {
  const rows = await prisma.adminAuditLog.findMany({ where: { action: "broadcast", entity: "notification" }, orderBy: { createdAt: "desc" }, take: 30 });
  const items = await Promise.all(rows.map(async (r) => {
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(r.details ?? "{}"); } catch { /* keep empty */ }
    const read = r.entityId ? await prisma.notification.count({ where: { dedupeKey: { startsWith: `${r.entityId}-` }, isRead: true } }) : 0;
    return { id: r.id, at: r.createdAt, by: r.staffName, type: d.type ?? "general", title: d.title ?? "", message: d.message ?? "", href: d.href ?? null, audience: d.audience ?? "all", phone: d.phone ?? null, sent: Number(d.sent ?? 0), pushed: Number(d.pushed ?? 0), read };
  }));
  send(res, items);
}));

overviewRouter.post("/notifications/broadcast", requirePermission("notifications.send"), handler(async (req, res) => {
  const b = parse(z.object({
    type: z.enum(["promo", "tournament", "general"]), title: z.string().min(2).max(60), message: z.string().min(2).max(240),
    href: z.string().regex(/^\/[a-z0-9/_-]*$/i).optional(), audience: AUDIENCE.default("all"), phone: z.string().regex(/^\d{10}$/).optional(),
  }).refine((v) => v.audience !== "customer" || !!v.phone, { message: "Enter the customer's mobile number", path: ["phone"] }), req.body);
  const { targets, optedOut } = await recipients(b);
  if (b.audience === "customer" && targets.length === 0) throw new AppError(404, "No active customer with that number (or they turned off promo notices)");
  const batch = `bcast-${Date.now()}`;
  const made = await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, type: b.type, title: b.title, message: b.message, href: b.href ?? null, dedupeKey: `${batch}-${userId}` })),
    skipDuplicates: true,
  });
  const pushed = await pushToUsers(targets, { title: b.title, body: b.message, href: b.href, tag: batch });
  await audit(req, "broadcast", "notification", batch, { ...b, sent: made.count, pushed: pushed.customers });
  send(res, { sent: made.count, skippedOptOut: optedOut, pushed: pushed.customers, pushEnabled: pushEnabled() }, "Notice sent", 201);
}));

// ---- reports ----
const range = (q: Record<string, unknown>) => {
  const to = parse(dateStr, q.to ?? todayKey());
  const from = parse(dateStr, q.from ?? addDaysKey(to, -29));
  if (from > to) throw new AppError(400, "from must be before to");
  if (addDaysKey(from, 92) < to) throw new AppError(400, "Pick 93 days or fewer");
  return { from, to };
};

overviewRouter.get("/reports/revenue", requirePermission("reports.view"), handler(async (req, res) => {
  const { from, to } = range(req.query);
  const [bookings, gz] = await Promise.all([
    prisma.booking.findMany({ where: { date: { gte: from, lte: to }, paymentStatus: "completed", status: { notIn: ["cancelled", "expired"] } }, select: { date: true, totalPrice: true, cashAmount: true, onlineAmount: true } }),
    prisma.gzBooking.findMany({ where: { date: { gte: from, lte: to }, paymentStatus: "paid", status: { notIn: ["cancelled", "expired"] } }, select: { date: true, total: true, paymentMethod: true } }),
  ]);
  const days = new Map<string, { date: string; courts: number; gamezone: number; cash: number; online: number; total: number }>();
  const day = (d: string) => { if (!days.has(d)) days.set(d, { date: d, courts: 0, gamezone: 0, cash: 0, online: 0, total: 0 }); return days.get(d)!; };
  for (const b of bookings) { const r = day(b.date); r.courts += b.totalPrice; r.cash += b.cashAmount; r.online += b.onlineAmount; r.total += b.totalPrice; }
  for (const g of gz) { const r = day(g.date); r.gamezone += g.total; if (g.paymentMethod === "venue") r.cash += g.total; else r.online += g.total; r.total += g.total; }
  const rows = [...days.values()].sort((a, c) => a.date.localeCompare(c.date));
  send(res, { from, to, rows, totals: rows.reduce((t, r) => ({ courts: t.courts + r.courts, gamezone: t.gamezone + r.gamezone, cash: t.cash + r.cash, online: t.online + r.online, total: t.total + r.total }), { courts: 0, gamezone: 0, cash: 0, online: 0, total: 0 }) });
}));

overviewRouter.get("/reports/occupancy", requirePermission("reports.view"), handler(async (req, res) => {
  const { from, to } = range(req.query);
  const [slots, noShows, cancelled] = await Promise.all([
    prisma.bookingSlot.groupBy({ by: ["date"], where: { date: { gte: from, lte: to }, NOT: { bookingId: { startsWith: "block:" } } }, _count: { _all: true } }),
    prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "no_show" } }),
    prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "cancelled" } }),
  ]);
  send(res, { from, to, bookedHoursByDay: slots.map((s) => ({ date: s.date, hours: s._count._all })).sort((a, b) => a.date.localeCompare(b.date)), noShows, cancelled });
}));

overviewRouter.get("/reports/loyalty-liability", requirePermission("reports.view"), handler(async (_req, res) => {
  const today = todayKey();
  const earned = await prisma.loyaltyEntry.aggregate({ where: { points: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: today } }] }, _sum: { points: true } });
  const spent = await prisma.loyaltyEntry.aggregate({ where: { points: { lt: 0 } }, _sum: { points: true } });
  const vouchers = await prisma.freeGameVoucher.count({ where: { status: "unused" } });
  // Upper bound: spent points are not matched to the lot they consumed, so this can overstate a little.
  send(res, { unexpiredEarnedPoints: Number(earned._sum.points ?? 0), spentPoints: Number(spent._sum.points ?? 0), unusedVouchers: vouchers, note: "Indicative upper bound" });
}));

// ---- audit log: who did what, to which record, when (every staff write leaves a row, see lib/audit.ts) ----
// Filters: entity, action, staffId, entityId, from / to (Nepal dates), q (staff name, record id or words in the details).
const auditWhere = (q: Record<string, unknown>): Prisma.AdminAuditLogWhereInput => {
  const str = (k: string) => (typeof q[k] === "string" && (q[k] as string).trim() ? (q[k] as string).trim() : undefined);
  const from = str("from");
  const to = str("to");
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new AppError(400, "Dates must look like 2026-10-07");
  if (from && to && from > to) throw new AppError(400, "The From date must not be after the To date");
  const text = str("q");
  return {
    ...(str("entity") ? { entity: str("entity") } : {}), ...(str("action") ? { action: str("action") } : {}), ...(str("staffId") ? { staffId: str("staffId") } : {}), ...(str("entityId") ? { entityId: str("entityId") } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00+05:45`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00+05:45`).getTime() + 86_400_000) } : {}) } } : {}),
    ...(text ? { OR: [{ staffName: { contains: text, mode: "insensitive" } }, { entityId: { contains: text, mode: "insensitive" } }, { details: { contains: text, mode: "insensitive" } }, { action: { contains: text, mode: "insensitive" } }, { entity: { contains: text, mode: "insensitive" } }] } : {}),
  };
};

overviewRouter.get("/audit", requirePermission("audit.view"), handler(async (req, res) => {
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const where = auditWhere(req.query as Record<string, unknown>);
  const [items, total] = await Promise.all([prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.adminAuditLog.count({ where })]);
  send(res, { items, total, page: pageNo, limit });
}));

// What can be filtered on, with how often each appears, plus a few counts for the top of the page.
overviewRouter.get("/audit/filters", requirePermission("audit.view"), handler(async (_req, res) => {
  const dayStart = new Date(`${todayKey()}T00:00:00+05:45`);
  const [entities, actions, staff, today, week, total] = await Promise.all([
    prisma.adminAuditLog.groupBy({ by: ["entity"], _count: { _all: true }, orderBy: { entity: "asc" } }),
    prisma.adminAuditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
    prisma.adminAuditLog.groupBy({ by: ["staffId", "staffName"], _count: { _all: true }, orderBy: { staffName: "asc" } }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: new Date(dayStart.getTime() - 6 * 86_400_000) } } }),
    prisma.adminAuditLog.count(),
  ]);
  const people = new Map<string, { id: string; name: string; count: number }>();
  for (const s of staff) { const p = people.get(s.staffId) ?? { id: s.staffId, name: s.staffName, count: 0 }; p.count += s._count._all; people.set(s.staffId, p); }
  send(res, {
    entities: entities.map((e) => ({ name: e.entity, count: e._count._all })), actions: actions.map((x) => ({ name: x.action, count: x._count._all })),
    staff: [...people.values()], summary: { total, today, week },
  });
}));

