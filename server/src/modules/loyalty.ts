import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify, pointsForGoods } from "../lib/customer-effects";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const loyaltyRouter = Router();
const phone = z.string().regex(/^9\d{9}$/, "registered mobile number like 98XXXXXXXX");

// ---- the Loyalty Points page ----
// Balance as the admin sees it: valid earned points plus spent (negative) ones. The customer app is the source of truth for what is spendable.
const KINDS = ["game", "goods", "membership", "referral", "captain_win", "free_game"] as const;
const SOON_DAYS = 30;

type Holder = { phone: string; valid: number; spent: number; expiring: number };
async function holders(): Promise<Holder[]> {
  const today = todayKey();
  const soon = addDaysKey(today, SOON_DAYS);
  const rows = await prisma.$queryRaw<{ userId: string; valid: Prisma.Decimal | null; spent: Prisma.Decimal | null; expiring: Prisma.Decimal | null }[]>`
    SELECT "userId",
      SUM(CASE WHEN "points" > 0 AND ("expiresOn" IS NULL OR "expiresOn" >= ${today}) THEN "points" ELSE 0 END) AS valid,
      SUM(CASE WHEN "points" < 0 THEN "points" ELSE 0 END) AS spent,
      SUM(CASE WHEN "points" > 0 AND "expiresOn" IS NOT NULL AND "expiresOn" >= ${today} AND "expiresOn" <= ${soon} THEN "points" ELSE 0 END) AS expiring
    FROM "LoyaltyEntry" GROUP BY "userId"`;
  return rows.map((r) => ({ phone: r.userId, valid: Number(r.valid ?? 0), spent: Number(r.spent ?? 0), expiring: Number(r.expiring ?? 0) }));
}
const round1 = (n: number) => Math.round(n * 10) / 10;

// Numbers for the top of the page: what was given and spent in the period, what is owed now, vouchers
loyaltyRouter.get("/overview", requirePermission("loyalty.view"), handler(async (req, res) => {
  const q = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
  const today = todayKey();
  const to = q.to ?? today;
  const from = q.from ?? addDaysKey(to, -29);
  if (from > to) throw new AppError(400, "The From date must not be after the To date");
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * 86_400_000) throw new AppError(400, "Pick at most a year");
  const inRange = { earnedOn: { gte: from, lte: to } };
  const [byKind, vouchers, all, voucherPeriod] = await Promise.all([
    prisma.loyaltyEntry.groupBy({ by: ["kind"], where: inRange, _sum: { points: true }, _count: { _all: true } }),
    prisma.freeGameVoucher.groupBy({ by: ["status"], _count: { _all: true } }),
    holders(),
    prisma.freeGameVoucher.count({ where: { claimedAt: { gte: new Date(`${from}T00:00:00+05:45`), lt: new Date(new Date(`${to}T00:00:00+05:45`).getTime() + 86_400_000) } } }),
  ]);
  const kind = (k: string) => byKind.find((x) => x.kind === k);
  const earned = byKind.filter((x) => Number(x._sum.points ?? 0) > 0).reduce((t, x) => t + Number(x._sum.points ?? 0), 0);
  const spent = byKind.filter((x) => Number(x._sum.points ?? 0) < 0).reduce((t, x) => t + Number(x._sum.points ?? 0), 0);
  const v = (st: string) => vouchers.find((x) => x.status === st)?._count._all ?? 0;
  const owed = all.reduce((t, h) => t + Math.max(0, h.valid + h.spent), 0);
  send(res, {
    from, to,
    period: {
      earned: round1(earned), spent: round1(-spent), claims: voucherPeriod,
      byKind: KINDS.map((k) => ({ kind: k, points: round1(Number(kind(k)?._sum.points ?? 0)), entries: kind(k)?._count._all ?? 0 })),
    },
    now: {
      owedPoints: round1(owed), customersWithPoints: all.filter((h) => h.valid + h.spent > 0).length,
      expiringSoon: { days: SOON_DAYS, points: round1(all.reduce((t, h) => t + h.expiring, 0)), customers: all.filter((h) => h.expiring > 0).length },
      vouchers: { unused: v("unused"), used: v("used"), void: v("void") },
    },
  });
}));

// Every customer who has points, with what they hold now, what expires soon and unused vouchers
loyaltyRouter.get("/customers", requirePermission("loyalty.view"), handler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const sort = req.query.sort === "expiring" ? "expiring" : req.query.sort === "name" ? "name" : "balance";
  const list = await holders();
  const phones = list.map((h) => h.phone);
  const [users, unused] = await Promise.all([
    prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true } }),
    prisma.freeGameVoucher.groupBy({ by: ["userId"], where: { status: "unused", userId: { in: phones } }, _count: { _all: true } }),
  ]);
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const vouch = new Map(unused.map((u) => [u.userId, u._count._all]));
  let rows = list.map((h) => ({ phone: h.phone, name: name.get(h.phone) ?? null, balance: round1(h.valid + h.spent), expiringSoon: round1(h.expiring), unusedVouchers: vouch.get(h.phone) ?? 0 }));
  if (q) rows = rows.filter((r) => r.phone.includes(q) || (r.name ?? "").toLowerCase().includes(q));
  rows.sort(sort === "name" ? (a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone) : sort === "expiring" ? (a, b) => b.expiringSoon - a.expiringSoon || b.balance - a.balance : (a, b) => b.balance - a.balance);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  send(res, { items: rows.slice(skip, skip + take), total: rows.length, page: pageNo, limit });
}));

// The ledger across all customers, newest first
loyaltyRouter.get("/ledger", requirePermission("loyalty.view"), handler(async (req, res) => {
  const q = parse(z.object({ kind: z.enum(KINDS).optional(), from: dateStr.optional(), to: dateStr.optional(), q: z.string().max(60).optional() }), req.query);
  const text = q.q?.trim();
  let phones: string[] | undefined;
  if (text) phones = (await prisma.user.findMany({ where: { OR: [{ phoneNumber: { contains: text } }, { name: { contains: text, mode: "insensitive" } }] }, select: { phoneNumber: true }, take: 200 })).map((u) => u.phoneNumber);
  const where: Prisma.LoyaltyEntryWhereInput = {
    ...(q.kind ? { kind: q.kind } : {}), ...(q.from || q.to ? { earnedOn: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(phones ? { OR: [{ userId: { in: phones } }, { detail: { contains: text!, mode: "insensitive" } }] } : {}),
  };
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const [rows, total] = await Promise.all([prisma.loyaltyEntry.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.loyaltyEntry.count({ where })]);
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const today = todayKey();
  send(res, {
    items: rows.map((r) => ({ id: r.id, phone: r.userId, name: name.get(r.userId) ?? null, kind: r.kind, points: Number(r.points), detail: r.detail, earnedOn: r.earnedOn, expiresOn: r.expiresOn, expired: !!r.expiresOn && r.expiresOn < today && Number(r.points) > 0, createdAt: r.createdAt })),
    total, page: pageNo, limit,
  });
}));

// Free-game vouchers across all customers
loyaltyRouter.get("/vouchers", requirePermission("loyalty.view"), handler(async (req, res) => {
  const status = ["unused", "used", "void"].find((x) => x === req.query.status);
  const where: Prisma.FreeGameVoucherWhereInput = status ? { status } : {};
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const [rows, total] = await Promise.all([prisma.freeGameVoucher.findMany({ where, orderBy: { claimedAt: "desc" }, take, skip }), prisma.freeGameVoucher.count({ where })]);
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const codes = new Map((await prisma.booking.findMany({ where: { id: { in: rows.flatMap((r) => (r.bookingId ? [r.bookingId] : [])) } }, select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  send(res, { items: rows.map((r) => ({ id: r.id, phone: r.userId, name: name.get(r.userId) ?? null, period: r.period, cost: Number(r.cost), status: r.status, bookingCode: r.bookingId ? codes.get(r.bookingId) ?? null : null, claimedAt: r.claimedAt, usedAt: r.usedAt })), total, page: pageNo, limit });
}));

loyaltyRouter.get("/customers/:phone", requirePermission("loyalty.view"), handler(async (req, res) => {
  const p = param(req, "phone");
  const [rows, vouchers] = await Promise.all([
    prisma.loyaltyEntry.findMany({ where: { userId: p }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.freeGameVoucher.findMany({ where: { userId: p }, orderBy: { claimedAt: "desc" } }),
  ]);
  const today = todayKey();
  const valid = rows.filter((r) => Number(r.points) > 0 && (!r.expiresOn || r.expiresOn >= today)).reduce((n, r) => n + Number(r.points), 0);
  const spent = rows.filter((r) => Number(r.points) < 0).reduce((n, r) => n + Number(r.points), 0);
  // Indicative only: the customer app is the source of truth for which points are still spendable.
  send(res, { approxBalance: Math.round((valid + spent) * 10) / 10, rows, vouchers });
}));

// Goods bought at the venue: Rs. 100 = 1 point (kept for a year).
loyaltyRouter.post("/goods-sale", requirePermission("loyalty.goods"), handler(async (req, res) => {
  const b = parse(z.object({ phone, amount: z.number().int().min(1).max(1000000), items: z.string().max(200).optional() }), req.body);
  const user = await prisma.user.findUnique({ where: { phoneNumber: b.phone }, select: { phoneNumber: true } });
  if (!user) throw new AppError(404, "No registered customer with this number");
  const sale = await prisma.goodsSale.create({ data: { userId: b.phone, phone: b.phone, amount: b.amount, items: b.items ?? null, soldBy: req.staff!.id } });
  const points = pointsForGoods(b.amount);
  const awarded = await awardPoints({ userId: b.phone, kind: "goods", points, sourceType: "goods", sourceId: sale.id, detail: `Goods Rs. ${b.amount}` });
  await audit(req, "goods-sale", "loyalty", sale.id, { phone: b.phone, amount: b.amount, points });
  send(res, { saleId: sale.id, points: awarded ? points : 0 }, "Sale recorded", 201);
}));

// Manual correction with a reason: managers and owners only. Positive adds game-type points, negative removes (spent).
loyaltyRouter.post("/adjust", requirePermission("loyalty.adjust"), handler(async (req, res) => {
  const b = parse(z.object({ phone, points: z.number().refine((n) => n !== 0 && Math.abs(n) <= 200, "between -200 and 200, not 0"), reason: z.string().min(5).max(200) }), req.body);
  if (!(await prisma.user.findUnique({ where: { phoneNumber: b.phone } }))) throw new AppError(404, "No registered customer with this number");
  const sourceId = `${Date.now()}-${req.staff!.id}`;
  const pts = Math.round(b.points * 10) / 10;
  if (pts > 0) {
    await awardPoints({ userId: b.phone, kind: "game", points: pts, sourceType: "adjustment", sourceId, detail: `Adjustment: ${b.reason}` });
  } else {
    await prisma.loyaltyEntry.create({ data: { userId: b.phone, kind: "free_game", points: new Prisma.Decimal(pts.toFixed(1)), earnedOn: todayKey(), expiresOn: null, sourceType: "adjustment", sourceId, detail: `Adjustment: ${b.reason}` } });
    await notify(prisma, { userId: b.phone, type: "points", title: "Points adjusted", message: `${pts} points: ${b.reason}`, href: "/points" });
  }
  await audit(req, "adjust", "loyalty", b.phone, { points: pts, reason: b.reason });
  send(res, null, "Points adjusted");
}));

loyaltyRouter.post("/vouchers/:id/void", requirePermission("loyalty.void"), handler(async (req, res) => {
  const id = param(req, "id");
  const v = await prisma.freeGameVoucher.findUnique({ where: { id } });
  if (!v) throw new AppError(404, "Voucher not found");
  if (v.status !== "unused") throw new AppError(409, `This voucher is ${v.status}`);
  await prisma.freeGameVoucher.update({ where: { id }, data: { status: "void" } });
  await audit(req, "void", "voucher", id, { userId: v.userId, period: v.period });
  send(res, null, "Voucher voided");
}));
