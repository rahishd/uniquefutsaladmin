// Reports page: one call for a period. Money is counted once, with the same rules as the Inventory report (inventory-report.ts):
// paid games by game date (cash / online as recorded when paid), goods by sale time plus credit goods when paid, Gamezone when paid.
// Memberships are reported on their own and are not in the sales totals.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, parse, send } from "../lib/http";
import { DEAD } from "../lib/settle";
import { requirePermission } from "../middleware/auth";

export const reportsSummaryRouter = Router();

type Split = { cash: number; fonepay: number };
const ONLINE = /fonepay|online|esewa/i;
const at = (key: string) => new Date(`${key}T00:00:00+05:45`);
const nepalDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" });
const dayOf = (d: Date) => nepalDay.format(d);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NOT_LEDGER = { AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }, { paymentMethod: { not: "membership" } }] };

const query = z.object({ from: dateStr.optional(), to: dateStr.optional() });

async function period(from: string, to: string) {
  const start = at(from);
  const end = at(addDaysKey(to, 1));
  const days = new Map<string, { date: string; games: number; goods: number; gamezone: number; tournaments: number; cash: number; fonepay: number; total: number }>();
  const day = (d: string) => days.get(d) ?? days.set(d, { date: d, games: 0, goods: 0, gamezone: 0, tournaments: 0, cash: 0, fonepay: 0, total: 0 }).get(d)!;
  const put = (d: string, kind: "games" | "goods" | "gamezone" | "tournaments", s: Split) => { const r = day(d); r[kind] += s.cash + s.fonepay; r.cash += s.cash; r.fonepay += s.fonepay; r.total += s.cash + s.fonepay; };

  // games
  const bookings = await prisma.booking.findMany({ where: { date: { gte: from, lte: to }, status: { notIn: DEAD }, ...NOT_LEDGER }, orderBy: { date: "asc" } });
  for (const b of bookings) {
    if (b.paymentStatus !== "completed") continue;
    let s: Split = { cash: b.cashAmount, fonepay: b.onlineAmount };
    if (s.cash + s.fonepay === 0) s = ONLINE.test(b.paymentMethod) ? { cash: 0, fonepay: Math.round(b.totalPrice) } : { cash: Math.round(b.totalPrice), fonepay: 0 };
    put(b.date, "games", s);
  }
  // goods
  const logs = await prisma.inventoryLog.findMany({ where: { createdAt: { gte: start, lt: end }, reason: { startsWith: "Goods Sale #" }, change: { lt: 0 } }, select: { createdAt: true, cashAmount: true, onlineAmount: true } });
  for (const l of logs) if (l.cashAmount + l.onlineAmount > 0) put(dayOf(l.createdAt), "goods", { cash: l.cashAmount, fonepay: l.onlineAmount });
  for (const d of await prisma.goodsDue.findMany({ where: { status: "paid", paidAt: { gte: start, lt: end } } })) put(dayOf(d.paidAt!), "goods", { cash: d.cashAmount, fonepay: d.onlineAmount });
  // gamezone
  const gz = await prisma.gzBooking.findMany({ where: { date: { gte: from, lte: to }, paymentStatus: "paid", status: { notIn: ["cancelled", "expired"] } }, select: { date: true, total: true, paymentMethod: true } });
  for (const g of gz) put(g.date, "gamezone", ONLINE.test(g.paymentMethod) ? { cash: 0, fonepay: g.total } : { cash: g.total, fonepay: 0 });

  // hosted tournaments: money received that day
  for (const p of await prisma.tournamentPayment.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { createdAt: true, cash: true, fonepay: true } })) put(dayOf(p.createdAt), "tournaments", { cash: p.cash, fonepay: p.fonepay });

  const byDay: ReturnType<typeof day>[] = [];
  for (let d = from; d <= to; d = addDaysKey(d, 1)) byDay.push(days.get(d) ?? { date: d, games: 0, goods: 0, gamezone: 0, tournaments: 0, cash: 0, fonepay: 0, total: 0 });
  const sum = (k: "games" | "goods" | "gamezone" | "tournaments" | "cash" | "fonepay" | "total") => byDay.reduce((t, r) => t + r[k], 0);
  return { bookings, byDay, totals: { cash: sum("cash"), fonepay: sum("fonepay"), total: sum("total"), games: sum("games"), goods: sum("goods"), gamezone: sum("gamezone"), tournaments: sum("tournaments") } };
}

reportsSummaryRouter.get("/summary", requirePermission("reports.view"), handler(async (req, res) => {
  const q = parse(query, req.query);
  const today = todayKey();
  const to = q.to ?? today;
  const from = q.from ?? addDaysKey(to, -29);
  if (from > to) throw new AppError(400, "The From date must not be after the To date");
  if (to > today) throw new AppError(400, "Pick dates up to today");
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  if (days > 93 || from < addDaysKey(today, -366)) throw new AppError(400, "Pick at most 93 days, within the last year");

  const [cur, prev] = await Promise.all([period(from, to), period(addDaysKey(from, -days), addDaysKey(from, -1))]);
  const all = cur.bookings;
  const live = all.filter((b) => b.status !== "no_show"); // games that took place or are coming; cancelled ones are already out, no-shows are counted on their own
  const cancelled = await prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "cancelled", ...NOT_LEDGER } });
  const noShows = await prisma.booking.count({ where: { date: { gte: from, lte: to }, status: "no_show", ...NOT_LEDGER } });

  // when and how people play
  const hours = new Map<number, number>();
  const weekdays = new Map<string, number>();
  const source = { app: 0, staff: 0, challenge: 0 };
  for (const b of live) {
    for (let h = Number(b.startTime.slice(0, 2)); h < Number(b.startTime.slice(0, 2)) + b.duration; h++) hours.set(h, (hours.get(h) ?? 0) + 1);
    const wd = WEEKDAYS[new Date(`${b.date}T00:00:00Z`).getUTCDay()];
    weekdays.set(wd, (weekdays.get(wd) ?? 0) + b.duration);
    if (b.source === "challenge") source.challenge++; else if (b.notes?.includes("WALK_IN")) source.staff++; else source.app++;
  }
  const bookedHours = [...hours.values()].reduce((t, n) => t + n, 0);

  // promo codes and the best customers
  const promos = new Map<string, { code: string; uses: number; discount: number }>();
  const people = new Map<string, { name: string; phone: string | null; games: number; spent: number }>();
  for (const b of live) {
    if (b.promoCode) { const p = promos.get(b.promoCode) ?? { code: b.promoCode, uses: 0, discount: 0 }; p.uses++; p.discount += Math.round(b.discountAmount); promos.set(b.promoCode, p); }
    const key = b.userId ?? b.customerPhone ?? b.customerName ?? "guest";
    const p = people.get(key) ?? { name: b.customerName ?? b.customerPhone ?? "Guest", phone: b.customerPhone ?? b.userId, games: 0, spent: 0 };
    p.games++; if (b.paymentStatus === "completed") p.spent += Math.round(b.totalPrice);
    people.set(key, p);
  }
  const names = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: [...people.values()].flatMap((p) => (p.phone ? [p.phone] : [])) } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));

  // standing numbers (not tied to the period)
  const nowDay = todayKey();
  const [earned, spentPts, vouchers, subs] = await Promise.all([
    prisma.loyaltyEntry.aggregate({ where: { points: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: nowDay } }] }, _sum: { points: true } }),
    prisma.loyaltyEntry.aggregate({ where: { points: { lt: 0 } }, _sum: { points: true } }),
    prisma.freeGameVoucher.count({ where: { status: "unused" } }),
    prisma.membershipSubscription.findMany({ select: { status: true, endDate: true, totalPrice: true, paymentStatus: true } }),
  ]);
  const soon = addDaysKey(nowDay, 15);
  const end = (s: { endDate: Date }) => s.endDate.toISOString().slice(0, 10);
  const activeSubs = subs.filter((s) => s.status === "active" && end(s) >= nowDay);

  send(res, {
    from, to, days, totals: cur.totals, previous: prev.totals, byDay: cur.byDay,
    games: {
      count: live.length, paid: live.filter((b) => b.paymentStatus === "completed").length, unpaid: live.filter((b) => b.paymentStatus !== "completed").length,
      unpaidAmount: live.filter((b) => b.paymentStatus !== "completed").reduce((t, b) => t + Math.round(b.totalPrice), 0),
      averageRate: live.length ? Math.round(live.reduce((t, b) => t + b.totalPrice, 0) / live.length) : 0, cancelled, noShows, source,
    },
    occupancy: {
      bookedHours, perDay: Math.round((bookedHours / days) * 10) / 10,
      peakHours: [...hours].map(([hour, games]) => ({ hour, games })).sort((a, b) => b.games - a.games || a.hour - b.hour).slice(0, 5),
      weekdays: WEEKDAYS.map((day) => ({ day, hours: weekdays.get(day) ?? 0 })),
    },
    promos: [...promos.values()].sort((a, b) => b.uses - a.uses).slice(0, 8),
    topCustomers: [...people.values()].map((p) => ({ ...p, name: (p.phone && names.get(p.phone)) || p.name })).sort((a, b) => b.spent - a.spent || b.games - a.games).slice(0, 8),
    loyalty: { unexpiredEarnedPoints: Number(earned._sum.points ?? 0), spentPoints: Number(spentPts._sum.points ?? 0), unusedVouchers: vouchers },
    memberships: {
      active: activeSubs.length, expiringSoon: activeSubs.filter((s) => end(s) <= soon).length, waitingForPayment: subs.filter((s) => s.status === "pending").length,
      activeValue: Math.round(activeSubs.reduce((t, s) => t + (s.totalPrice ?? 0), 0)),
    },
  });
}));
