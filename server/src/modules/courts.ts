import { memberHolds } from "../lib/member-holds";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { todayKey } from "../lib/dates";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getHourlyPricing, getHourlyRate, setSetting } from "./settings-store";

export const courtsRouter = Router();

courtsRouter.get("/pricing", requirePermission("courts.view"), handler(async (_req, res) => {
  send(res, { hourlyRate: await getHourlyRate(), hourlyPricing: await getHourlyPricing() });
}));

// Price per start hour. Customers see the new price at their next quote (the server recomputes it every time).
courtsRouter.put("/pricing", requirePermission("courts.price"), handler(async (req, res) => {
  const b = parse(z.object({
    hourlyRate: z.number().int().min(100, "at least Rs. 100").max(100000).optional(),
    hours: z.array(z.object({ hour: z.number().int().min(0).max(23), price: z.number().int().min(100, "at least Rs. 100").max(100000) })).max(24).optional(),
  }), req.body);
  if (b.hourlyRate !== undefined) await setSetting("hourlyRate", String(b.hourlyRate));
  if (b.hours) {
    const current = new Map((await getHourlyPricing()).map((p) => [Number(p.id.replace("ts-", "")), p]));
    for (const h of b.hours) current.set(h.hour, { id: `ts-${h.hour}`, time: `${String(h.hour).padStart(2, "0")}:00`, price: h.price });
    await setSetting("hourlyPricing", JSON.stringify([...current.values()].sort((a, c) => Number(a.id.slice(3)) - Number(c.id.slice(3)))));
  }
  await audit(req, "update-pricing", "pricing", null, b);
  send(res, { hourlyRate: await getHourlyRate(), hourlyPricing: await getHourlyPricing() }, "Pricing saved");
}));

// Day view: every hour is free, booked (with who) or blocked.
courtsRouter.get("/slots", requirePermission("slots.view"), handler(async (req, res) => {
  const date = parse(dateStr, req.query.date ?? todayKey());
  const [slots, blocks] = await Promise.all([prisma.bookingSlot.findMany({ where: { date } }), prisma.slotBlock.findMany({ where: { date } })]);
  const bookings = await prisma.booking.findMany({ where: { id: { in: slots.map((s) => s.bookingId) } }, select: { id: true, code: true, customerName: true, customerPhone: true, userId: true, status: true, paymentStatus: true, startTime: true, endTime: true, duration: true, totalPrice: true, source: true, notes: true, promoCode: true, discountAmount: true, voucherId: true } });
  const pricing = await getHourlyPricing();
  const fallback = await getHourlyRate();
  const held = await memberHolds([date], Array.from({ length: 24 }, (_, h) => h));
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const slot = slots.find((s) => s.hour === hour);
    const block = blocks.find((x) => x.hour === hour);
    const price = pricing.find((p) => Number(p.id.slice(3)) === hour)?.price ?? fallback;
    return { hour, price, state: block ? "blocked" : slot ? "booked" : "free", block: block ?? null, booking: slot && !block ? bookings.find((b) => b.id === slot.bookingId) ?? null : null, member: held.find((h) => h.hour === hour) ?? null };
  });
  send(res, { date, hours });
}));

courtsRouter.get("/blocks", requirePermission("courts.view"), handler(async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : todayKey();
  send(res, await prisma.slotBlock.findMany({ where: { date: { gte: from } }, orderBy: [{ date: "asc" }, { hour: "asc" }] }));
}));

// Games that are still to be played in the hours being closed (pending or confirmed), grouped by booking: a booking of
// several hours appears once. Finished games (completed, no-show) cannot be closed over.
async function bookingsInHours(date: string, hours: number[]) {
  const slots = await prisma.bookingSlot.findMany({ where: { date, hour: { in: hours }, NOT: { bookingId: { startsWith: "block:" } } }, select: { bookingId: true, hour: true } });
  const ids = [...new Set(slots.map((s) => s.bookingId))];
  const rows = ids.length ? await prisma.booking.findMany({ where: { id: { in: ids } } }) : [];
  return rows;
}

// A block is a SlotBlock row plus a BookingSlot row, so the customer app's unique (date, hour) guard stops anyone booking it.
// Blocking an hour that already has games cancels them: each customer is told the reason, a paid online booking is marked
// for refund and a used free-game voucher is given back. dryRun only lists what would be cancelled.
courtsRouter.post("/blocks", requirePermission("courts.block"), handler(async (req, res) => {
  const b = parse(z.object({ date: dateStr, hours: z.array(z.number().int().min(0).max(23)).min(1).max(24), reason: z.string().trim().min(2).max(120), dryRun: z.boolean().default(false) }), req.body);
  if (b.date < todayKey()) throw new AppError(400, "Pick today or a later date");
  const hours = [...new Set(b.hours)];
  const affected = await bookingsInHours(b.date, hours);
  const finished = affected.find((x) => x.status === "completed" || x.status === "no_show");
  if (finished) throw new AppError(409, `The game on ${finished.date} at ${finished.startTime} is already ${finished.status === "completed" ? "completed" : "marked no-show"}, so that hour cannot be blocked`);
  const toCancel = affected.filter((x) => x.status !== "cancelled");
  const brief = toCancel.map((x) => ({ id: x.id, code: x.code ?? "UF-" + x.id.slice(-6).toUpperCase(), customer: x.customerName ?? x.customerPhone, phone: x.customerPhone ?? x.userId, time: `${x.startTime}-${x.endTime}`, paid: x.paymentStatus === "completed" }));
  if (b.dryRun) return send(res, { wouldCancel: brief });
  try {
    const created = await prisma.$transaction(async (tx) => {
      for (const bk of toCancel) {
        // the record is kept; every hour of that booking is freed (a booking is cancelled whole)
        await tx.booking.update({ where: { id: bk.id }, data: { status: "cancelled", cancelledAt: new Date(), holdExpiresAt: null } });
        await tx.bookingSlot.deleteMany({ where: { bookingId: bk.id } });
        await tx.freeGameVoucher.updateMany({ where: { bookingId: bk.id, status: "used" }, data: { status: "unused", bookingId: null, usedAt: null } });
        const order = bk.paymentOrderCode ? await tx.paymentOrder.findUnique({ where: { orderCode: bk.paymentOrderCode } }) : null;
        if (order?.status === "paid") {
          await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "refunded" } });
          await tx.paymentEvent.create({ data: { orderCode: order.orderCode, source: "staff", payload: JSON.stringify({ event: "REFUND_DUE", reason: "HOUR_BLOCKED_BY_VENUE", amount: order.amount, method: order.method }) } });
        }
      }
      const out = [];
      for (const hour of hours) {
        const blk = await tx.slotBlock.create({ data: { date: b.date, hour, reason: b.reason, createdBy: req.staff!.id } });
        await tx.bookingSlot.create({ data: { date: b.date, hour, bookingId: `block:${blk.id}` } });
        out.push(blk);
      }
      return out;
    });
    for (const bk of toCancel) {
      if (bk.userId) await notify(prisma, { userId: bk.userId, type: "booking", title: "Booking cancelled by the venue", message: `Your booking on ${bk.date} at ${bk.startTime} was cancelled because the court is closed: ${b.reason}.${bk.paymentStatus === "completed" ? " Your payment will be refunded." : ""} Sorry for the trouble.`, href: "/profile", dedupeKey: `blocked-${bk.id}` });
    }
    await audit(req, "block", "slot", null, { date: b.date, hours, reason: b.reason, cancelled: brief.map((x) => x.code) });
    send(res, { blocks: created, cancelled: brief }, brief.length ? `Hours blocked. ${brief.length} booking${brief.length === 1 ? "" : "s"} cancelled and the customers told.` : "Hours blocked", 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "One of those hours is already booked or blocked");
    throw e;
  }
}));

courtsRouter.delete("/blocks/:id", requirePermission("courts.block"), handler(async (req, res) => {
  const id = param(req, "id");
  const blk = await prisma.slotBlock.findUnique({ where: { id } });
  if (!blk) throw new AppError(404, "Block not found");
  await prisma.$transaction([prisma.bookingSlot.deleteMany({ where: { bookingId: `block:${id}` } }), prisma.slotBlock.delete({ where: { id } })]);
  await audit(req, "unblock", "slot", id, { date: blk.date, hour: blk.hour });
  send(res, null, "Block removed");
}));
