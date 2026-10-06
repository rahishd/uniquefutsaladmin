import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardForCompletedBooking } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const paymentsRouter = Router();

const payloadOf = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

paymentsRouter.get("/", requirePermission("payments.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const where: Prisma.PaymentOrderWhereInput = {
    ...(q.status ? { status: q.status } : {}), ...(q.purpose ? { purpose: q.purpose } : {}), ...(q.method ? { method: q.method } : {}),
    ...(q.q ? { OR: [{ orderCode: { contains: q.q, mode: "insensitive" } }, { userId: { contains: q.q } }, { guestPhone: { contains: q.q } }] } : {}),
  };
  const [items, total] = await Promise.all([prisma.paymentOrder.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.paymentOrder.count({ where })]);
  send(res, { items, total, page: pageNo, limit });
}));

// Reconciliation: money that moved without a matching result (paid orders whose booking is not paid, and the reverse).
paymentsRouter.get("/reconciliation", requirePermission("payments.view"), handler(async (_req, res) => {
  const paid = await prisma.paymentOrder.findMany({ where: { status: "paid", purpose: "game" }, orderBy: { paidAt: "desc" }, take: 300 });
  const bookings = await prisma.booking.findMany({ where: { paymentOrderCode: { in: paid.map((o) => o.orderCode) } }, select: { paymentOrderCode: true, paymentStatus: true, status: true, code: true } });
  const byCode = new Map(bookings.map((b) => [b.paymentOrderCode, b]));
  const paidButBookingNotPaid = paid.filter((o) => { const b = byCode.get(o.orderCode); return b && b.paymentStatus !== "completed" && b.status !== "cancelled"; });
  const expiredButPaid = await prisma.booking.findMany({ where: { status: "expired", paymentStatus: "completed" }, take: 100 });
  const failedEvents = await prisma.paymentEvent.findMany({ where: { source: "gateway", payload: { contains: "FAILED" } }, orderBy: { receivedAt: "desc" }, take: 50 });
  send(res, { paidButBookingNotPaid, expiredButPaid, failedEvents });
}));

// Online orders cancelled after payment: staff pay the money back, then record it here.
paymentsRouter.get("/refunds", requirePermission("payments.view"), handler(async (req, res) => {
  const refunded = await prisma.paymentOrder.findMany({ where: { status: "refunded" }, orderBy: { updatedAt: "desc" }, take: 300 });
  const events = await prisma.paymentEvent.findMany({ where: { orderCode: { in: refunded.map((o) => o.orderCode) } }, orderBy: { receivedAt: "asc" } });
  const items = refunded.map((o) => {
    const done = events.find((e) => e.orderCode === o.orderCode && payloadOf(e.payload).event === "REFUND_PAID");
    return { ...o, refundPaid: !!done, refundDetails: done ? payloadOf(done.payload) : null };
  });
  const only = req.query.status === "due" ? items.filter((i) => !i.refundPaid) : req.query.status === "paid" ? items.filter((i) => i.refundPaid) : items;
  send(res, only);
}));

paymentsRouter.post("/:orderCode/refund", requirePermission("payments.refund"), handler(async (req, res) => {
  const b = parse(z.object({ method: z.enum(["cash", "esewa", "fonepay", "bank"]), reference: z.string().max(80).optional(), note: z.string().max(200).optional() }), req.body);
  const code = param(req, "orderCode");
  const order = await prisma.paymentOrder.findUnique({ where: { orderCode: code } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status !== "refunded") throw new AppError(409, "This order has no refund due");
  const events = await prisma.paymentEvent.findMany({ where: { orderCode: code } });
  if (events.some((e) => payloadOf(e.payload).event === "REFUND_PAID")) throw new AppError(409, "Refund already recorded");
  await prisma.paymentEvent.create({ data: { orderCode: code, source: "staff", payload: JSON.stringify({ event: "REFUND_PAID", amount: order.amount, by: req.staff!.id, ...b }) } });
  await audit(req, "refund", "payment", code, { amount: order.amount, ...b });
  send(res, null, "Refund recorded");
}));

// Mark an order paid after the money was received outside the gateway (venue counter, manual eSewa check).
paymentsRouter.post("/:orderCode/mark-paid", requirePermission("payments.collect"), handler(async (req, res) => {
  const code = param(req, "orderCode");
  const order = await prisma.paymentOrder.findUnique({ where: { orderCode: code } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "paid") throw new AppError(409, "Already paid");
  if (order.status === "refunded") throw new AppError(409, "This order was refunded");
  if (order.purpose !== "game" && order.purpose !== "gamezone") throw new AppError(400, "Membership payments are verified from the membership screen");
  await prisma.$transaction(async (tx) => {
    await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "paid", paidAt: new Date(), paidBy: req.staff!.id } });
    await tx.paymentEvent.create({ data: { orderCode: code, source: "staff", payload: JSON.stringify({ event: "MARKED_PAID", by: req.staff!.id }) } });
    if (order.purpose === "game") {
      const b = await tx.booking.findFirst({ where: { paymentOrderCode: code } });
      if (b && b.status !== "cancelled") await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: "completed", status: b.status === "pending" ? "confirmed" : b.status, holdExpiresAt: null, amountPaidNow: b.totalPrice, remainingAmount: 0, onlineAmount: b.totalPrice } });
    } else {
      await tx.gzBooking.updateMany({ where: { code, status: { not: "cancelled" } }, data: { paymentStatus: "paid", status: "confirmed", holdExpiresAt: null } });
    }
  });
  const b = await prisma.booking.findFirst({ where: { paymentOrderCode: code } });
  if (b?.status === "completed") await awardForCompletedBooking(b);
  await audit(req, "mark-paid", "payment", code, { amount: order.amount });
  send(res, null, "Marked as paid");
}));
