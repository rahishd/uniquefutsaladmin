// Inventory report for a day or a date range: sales totals (Fonepay and cash) and the detail behind them.
// Every rupee is counted once, from the table that owns it:
//   games      -> Booking (cash / online recorded when it is paid), by game date; membership ledger rows are not games
//   goods      -> InventoryLog of each goods sale (the cash / online split made at the counter) by sale time, plus GoodsDue paid later (by paid time).
//                Goods given on credit are not money until they are paid. A bill (Checkout) only repeats these amounts, so it is never added.
//   gamezone   -> GzBooking that is paid, by session date
// Memberships are listed with their own amounts and are not part of the totals.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { DEAD } from "../lib/settle";

export const inventoryReportRouter = Router();

const query = z.object({ from: dateStr.optional(), to: dateStr.optional() });
const at = (key: string) => new Date(`${key}T00:00:00+05:45`);
type Split = { cash: number; fonepay: number };
const zero = (): Split => ({ cash: 0, fonepay: 0 });
const add = (a: Split, b: Split) => { a.cash += b.cash; a.fonepay += b.fonepay; };
const ONLINE = /fonepay|online|esewa/i;
const label = (s: Split, credit = false) => (credit ? "On credit" : s.cash && s.fonepay ? "Cash + Fonepay" : s.fonepay ? "Fonepay" : s.cash ? "Cash" : "Not paid");

inventoryReportRouter.get("/report", requirePermission("inventory.view"), handler(async (req, res) => {
  const q = parse(query, req.query);
  const today = todayKey();
  const from = q.from ?? q.to ?? today;
  const to = q.to ?? from;
  if (from > to) throw new AppError(400, "The From date must not be after the To date");
  if (to > addDaysKey(today, 1) || from < addDaysKey(today, -366)) throw new AppError(400, "Pick dates within the last year");
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 92 * 86_400_000) throw new AppError(400, "Pick at most 93 days at a time");
  send(res, await buildReport(from, to));
}));

export async function buildReport(from: string, to: string) {
  const start = at(from);
  const end = at(addDaysKey(to, 1));

  // ----- games -----
  const bookings = await prisma.booking.findMany({
    where: { date: { gte: from, lte: to }, status: { notIn: DEAD }, AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }, { paymentMethod: { not: "membership" } }] },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const gameMoney = zero();
  const games = bookings.map((b) => {
    const paid = b.paymentStatus === "completed";
    let split: Split = { cash: b.cashAmount, fonepay: b.onlineAmount };
    if (paid && split.cash + split.fonepay === 0) split = ONLINE.test(b.paymentMethod) ? { cash: 0, fonepay: Math.round(b.totalPrice) } : { cash: Math.round(b.totalPrice), fonepay: 0 };
    if (!paid) split = zero();
    add(gameMoney, split);
    return { id: b.id, code: b.code, date: b.date, startTime: b.startTime, team: b.customerName ?? b.customerPhone ?? "Guest", phone: b.customerPhone ?? b.userId, rate: Math.round(b.totalPrice), promoCode: b.promoCode, discount: Math.round(b.discountAmount), paid, payment: paid ? label(split) : "Not paid" };
  });

  // ----- goods -----
  const logs = await prisma.inventoryLog.findMany({ where: { createdAt: { gte: start, lt: end }, reason: { startsWith: "Goods Sale #" }, change: { lt: 0 } }, include: { product: { select: { name: true } } } });
  const saleIds = [...new Set(logs.map((l) => l.reason!.slice("Goods Sale #".length)))];
  const sales = await prisma.goodsSale.findMany({ where: { id: { in: saleIds } }, orderBy: { soldAt: "asc" } });
  const dues = await prisma.goodsDue.findMany({ where: { saleId: { in: saleIds } } });
  const dueBySale = new Map(dues.map((d) => [d.saleId, d]));
  const names = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: sales.flatMap((s) => (s.userId ? [s.userId] : [])) } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const goodsMoney = zero();
  const itemTotals = new Map<string, { name: string; qty: number; amount: number }>();
  const purchases = new Map<string, { phone: string | null; name: string; total: number; sales: unknown[] }>();
  for (const s of sales) {
    const mine = logs.filter((l) => l.reason === `Goods Sale #${s.id}`);
    const split: Split = { cash: mine.reduce((t, l) => t + l.cashAmount, 0), fonepay: mine.reduce((t, l) => t + l.onlineAmount, 0) };
    const due = dueBySale.get(s.id);
    const credit = !!due && due.status === "due";
    add(goodsMoney, split);
    const items = mine.map((l) => {
      const qty = -l.change;
      const amount = Math.round((l.price ?? 0) * qty);
      const t = itemTotals.get(l.productId) ?? { name: l.product.name, qty: 0, amount: 0 };
      t.qty += qty; t.amount += amount; itemTotals.set(l.productId, t);
      return { name: l.product.name, qty, price: l.price ?? 0, amount };
    });
    const key = s.userId ?? s.phone ?? "walk-in";
    const who = purchases.get(key) ?? { phone: s.userId ?? s.phone, name: (s.userId && names.get(s.userId)) || s.phone || "Walk-in customer", total: 0, sales: [] };
    who.total += s.amount;
    who.sales.push({ id: s.id, time: s.soldAt, items, amount: s.amount, payment: due ? (credit ? "On credit" : "Paid later") : label(split), credit, paid: !credit });
    purchases.set(key, who);
  }
  // goods taken on credit earlier and paid in this period: the money counts today, the items were listed on the day they were taken
  const paidLater = await prisma.goodsDue.findMany({ where: { status: "paid", paidAt: { gte: start, lt: end } } });
  for (const d of paidLater) add(goodsMoney, { cash: d.cashAmount, fonepay: d.onlineAmount });
  const paidLaterTotal = paidLater.reduce((t, d) => t + d.amount, 0);

  // ----- gamezone -----
  const gz = await prisma.gzBooking.findMany({ where: { date: { gte: from, lte: to }, status: { notIn: ["cancelled", "expired"] } }, orderBy: [{ date: "asc" }, { startHour: "asc" }] });
  const gzNames = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: gz.flatMap((g) => (g.userId ? [g.userId] : [])) } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const consoles = new Map((await prisma.gzConsole.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const gzMoney = zero();
  const gamezone = gz.map((g) => {
    const paid = g.paymentStatus === "paid";
    const split: Split = paid ? (ONLINE.test(g.paymentMethod) ? { cash: 0, fonepay: g.total } : { cash: g.total, fonepay: 0 }) : zero();
    add(gzMoney, split);
    return {
      code: g.code, date: g.date, startHour: g.startHour, customer: (g.userId && gzNames.get(g.userId)) || g.guestName || g.guestPhone || "Guest", phone: g.userId ?? g.guestPhone,
      console: consoles.get(g.consoleId) ?? "Console", game: g.gameTitle, players: g.players, hours: g.hours, extraHours: Math.max(0, g.hours - 1), total: g.total, paid, payment: paid ? label(split) : "Not paid", status: g.status,
    };
  });

  // ----- memberships paid or started in this period -----
  const subs = await prisma.membershipSubscription.findMany({
    where: { OR: [{ createdAt: { gte: start, lt: end } }, { paymentVerifiedAt: { gte: start, lt: end } }] },
    include: { plan: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { createdAt: "asc" },
  });
  const memberships = subs.map((s) => ({
    id: s.id, memberCode: s.memberCode, customer: s.user.name ?? s.userId, phone: s.userId, plan: s.plan.name, length: s.chosenDuration, timeSlot: s.timeSlot, days: s.chosenDays,
    startDate: s.startDate.toISOString().slice(0, 10), endDate: s.endDate.toISOString().slice(0, 10), amount: Math.round(s.totalPrice ?? 0), status: s.status, paymentStatus: s.paymentStatus,
  }));

  const totals = { cash: gameMoney.cash + goodsMoney.cash + gzMoney.cash, fonepay: gameMoney.fonepay + goodsMoney.fonepay + gzMoney.fonepay };
  return {
    from, to,
    totals: { ...totals, total: totals.cash + totals.fonepay, bySource: { games: gameMoney, goods: goodsMoney, gamezone: gzMoney } },
    games: { count: games.length, paidCount: games.filter((g) => g.paid).length, amount: games.reduce((t, g) => t + g.rate, 0), items: games },
    purchases: { customers: [...purchases.values()].sort((a, b) => b.total - a.total), total: sales.reduce((t, s) => t + s.amount, 0), paidLaterTotal },
    gamezone: { count: gamezone.length, amount: gamezone.reduce((t, g) => t + g.total, 0), items: gamezone },
    memberships: { count: memberships.length, amount: memberships.reduce((t, m) => t + m.amount, 0), items: memberships },
    itemsSold: [...itemTotals.values()].sort((a, b) => b.amount - a.amount),
  };
}
