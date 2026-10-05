import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify, pointsForGoods } from "../lib/customer-effects";
import { todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const loyaltyRouter = Router();
const phone = z.string().regex(/^9\d{9}$/, "registered mobile number like 98XXXXXXXX");

loyaltyRouter.get("/customers/:phone", requirePermission("loyalty.read"), handler(async (req, res) => {
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
loyaltyRouter.post("/goods-sale", requirePermission("loyalty.write"), handler(async (req, res) => {
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

loyaltyRouter.post("/vouchers/:id/void", requirePermission("loyalty.adjust"), handler(async (req, res) => {
  const id = param(req, "id");
  const v = await prisma.freeGameVoucher.findUnique({ where: { id } });
  if (!v) throw new AppError(404, "Voucher not found");
  if (v.status !== "unused") throw new AppError(409, `This voucher is ${v.status}`);
  await prisma.freeGameVoucher.update({ where: { id }, data: { status: "void" } });
  await audit(req, "void", "voucher", id, { userId: v.userId, period: v.period });
  send(res, null, "Voucher voided");
}));
