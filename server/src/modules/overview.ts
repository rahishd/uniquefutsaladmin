// Dashboard numbers, arrivals, notices, reports and the audit log.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const overviewRouter = Router();

overviewRouter.get("/dashboard", handler(async (_req, res) => {
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

// ---- broadcast ----
overviewRouter.post("/notifications/broadcast", requirePermission("notifications.write"), handler(async (req, res) => {
  const b = parse(z.object({
    type: z.enum(["promo", "tournament", "general"]), title: z.string().min(2).max(60), message: z.string().min(2).max(240),
    href: z.string().regex(/^\/[a-z0-9/_-]*$/i).optional(), audience: z.enum(["all", "captains"]).default("all"),
  }), req.body);
  const prefs = b.type === "promo" ? await prisma.userPrefs.findMany({ where: { promoNotifications: false }, select: { userId: true } }) : [];
  const optedOut = new Set(prefs.map((p) => p.userId));
  const captains = b.audience === "captains" ? new Set((await prisma.team.findMany({ select: { captainId: true } })).map((t) => t.captainId)) : null;
  const users = await prisma.user.findMany({ where: { role: "user", isActive: true }, select: { phoneNumber: true } });
  const targets = users.map((u) => u.phoneNumber).filter((p) => !optedOut.has(p) && (!captains || captains.has(p)));
  const batch = `bcast-${Date.now()}`;
  const made = await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, type: b.type, title: b.title, message: b.message, href: b.href ?? null, dedupeKey: `${batch}-${userId}` })),
    skipDuplicates: true,
  });
  await audit(req, "broadcast", "notification", batch, { ...b, sent: made.count });
  send(res, { sent: made.count, skippedOptOut: optedOut.size }, "Notice sent", 201);
}));

// ---- reports ----
const range = (q: Record<string, unknown>) => {
  const to = parse(dateStr, q.to ?? todayKey());
  const from = parse(dateStr, q.from ?? addDaysKey(to, -29));
  if (from > to) throw new AppError(400, "from must be before to");
  if (addDaysKey(from, 92) < to) throw new AppError(400, "Pick 93 days or fewer");
  return { from, to };
};

overviewRouter.get("/reports/revenue", requirePermission("reports.read"), handler(async (req, res) => {
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

overviewRouter.get("/reports/occupancy", requirePermission("reports.read"), handler(async (req, res) => {
  const { from, to } = range(req.query);
  const [slots, noShows, cancelled] = await Promise.all([
    prisma.bookingSlot.groupBy({ by: ["date"], where: { date: { gte: from, lte: to }, NOT: { bookingId: { startsWith: "block:" } } }, _count: { _all: true } }),
    prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "no_show" } }),
    prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "cancelled" } }),
  ]);
  send(res, { from, to, bookedHoursByDay: slots.map((s) => ({ date: s.date, hours: s._count._all })).sort((a, b) => a.date.localeCompare(b.date)), noShows, cancelled });
}));

overviewRouter.get("/reports/loyalty-liability", requirePermission("reports.read"), handler(async (_req, res) => {
  const today = todayKey();
  const earned = await prisma.loyaltyEntry.aggregate({ where: { points: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: today } }] }, _sum: { points: true } });
  const spent = await prisma.loyaltyEntry.aggregate({ where: { points: { lt: 0 } }, _sum: { points: true } });
  const vouchers = await prisma.freeGameVoucher.count({ where: { status: "unused" } });
  // Upper bound: spent points are not matched to the lot they consumed, so this can overstate a little.
  send(res, { unexpiredEarnedPoints: Number(earned._sum.points ?? 0), spentPoints: Number(spent._sum.points ?? 0), unusedVouchers: vouchers, note: "Indicative upper bound" });
}));

// ---- audit log ----
overviewRouter.get("/audit", requirePermission("audit.read"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const where: Prisma.AdminAuditLogWhereInput = { ...(q.entity ? { entity: q.entity } : {}), ...(q.action ? { action: q.action } : {}), ...(q.staffId ? { staffId: q.staffId } : {}), ...(q.entityId ? { entityId: q.entityId } : {}) };
  const [items, total] = await Promise.all([prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.adminAuditLog.count({ where })]);
  send(res, { items, total, page: pageNo, limit });
}));
