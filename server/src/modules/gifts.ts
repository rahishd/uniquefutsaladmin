// Gift Card: what customers bought for a friend in the customer app.
//   - points: loyalty points at Rs. 10 each, paid with Fonepay (order code = the gift code, purpose "gift_points");
//     the customer backend adds them to the friend (LoyaltyEntry kind "gift") when the payment is confirmed.
//   - game: a 1-hour booking on the FRIEND's account, paid by the buyer (order code = the booking id, notes "GIFT_FROM:<buyer>").
// Staff see every gift and can cancel a paid one: a gifted game is cancelled (slot freed), gifted points are taken back,
// and the money is put on the Refunds list (Payments > Refunds) to be paid back to the buyer.
import { Gift, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify, pointsHref } from "../lib/customer-effects";
import { todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const giftsRouter = Router();

const filters = z.object({
  kind: z.enum(["points", "game"]).optional(),
  status: z.enum(["pending", "paid", "expired", "refunded"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  q: z.string().trim().max(60).optional(),
});
type F = z.infer<typeof filters>;

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "Customer";

// date range on the day the gift was made (Nepal time)
function base(f: F, phones?: string[]): Prisma.GiftWhereInput {
  return {
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00+05:45`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999+05:45`) } : {}) } } : {}),
    ...(f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { buyerId: { contains: f.q } }, { friendId: { contains: f.q } }, ...(phones?.length ? [{ buyerId: { in: phones } }, { friendId: { in: phones } }] : [])] } : {}),
  };
}

async function views(rows: Gift[]) {
  const phones = [...new Set(rows.flatMap((g) => [g.buyerId, g.friendId]))];
  const bookingIds = rows.flatMap((g) => (g.bookingId ? [g.bookingId] : []));
  const orderCodes = rows.map((g) => (g.kind === "game" ? g.bookingId ?? g.code : g.code));
  const [users, bookings, orders, events, entries] = await Promise.all([
    prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true } }),
    bookingIds.length ? prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, code: true, date: true, startTime: true, endTime: true, status: true, paymentStatus: true } }) : [],
    prisma.paymentOrder.findMany({ where: { orderCode: { in: orderCodes } }, select: { orderCode: true, status: true, paidAt: true, amount: true } }),
    prisma.paymentEvent.findMany({ where: { orderCode: { in: orderCodes }, payload: { contains: "REFUND_PAID" } }, select: { orderCode: true } }),
    prisma.loyaltyEntry.findMany({ where: { sourceType: { in: ["gift", "gift_refund"] }, sourceId: { in: rows.map((g) => g.id) } }, select: { sourceType: true, sourceId: true, points: true } }),
  ]);
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const bk = new Map(bookings.map((b) => [b.id, b]));
  const ord = new Map(orders.map((o) => [o.orderCode, o]));
  const refundPaid = new Set(events.map((e) => e.orderCode));
  return rows.map((g) => {
    const orderCode = g.kind === "game" ? g.bookingId ?? g.code : g.code;
    const o = ord.get(orderCode);
    const b = g.bookingId ? bk.get(g.bookingId) : undefined;
    return {
      id: g.id, code: g.code, kind: g.kind, status: g.status, points: g.points, amount: g.amount, message: g.message, createdAt: g.createdAt, paidAt: g.paidAt,
      buyer: { phone: g.buyerId, name: name.get(g.buyerId) ?? null },
      friend: { phone: g.friendId, name: name.get(g.friendId) ?? null },
      payment: { orderCode, status: o?.status ?? null, paidAt: o?.paidAt ?? null, refundPaid: refundPaid.has(orderCode) },
      game: b ? { bookingId: b.id, code: b.code, date: b.date, startTime: b.startTime, endTime: b.endTime, status: b.status, paymentStatus: b.paymentStatus } : null,
      pointsDelivered: entries.some((e) => e.sourceType === "gift" && e.sourceId === g.id),
      pointsTakenBack: entries.some((e) => e.sourceType === "gift_refund" && e.sourceId === g.id),
    };
  });
}

giftsRouter.get("/", requirePermission("giftcards.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  let phones: string[] | undefined;
  if (f.q) {
    phones = (await prisma.user.findMany({ where: { name: { contains: f.q, mode: "insensitive" } }, select: { phoneNumber: true }, take: 200 })).map((u) => u.phoneNumber);
  }
  const b = base(f, phones);
  const where: Prisma.GiftWhereInput = { ...b, ...(f.status ? { status: f.status } : {}) };
  // the cards follow the kind, date and search filters, not the status
  const [rows, total, byStatus, paidByKind, refundDue] = await Promise.all([
    prisma.gift.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.gift.count({ where }),
    prisma.gift.groupBy({ by: ["status"], where: b, _count: { _all: true } }),
    prisma.gift.groupBy({ by: ["kind"], where: { ...b, status: "paid" }, _sum: { amount: true, points: true }, _count: { _all: true } }),
    prisma.gift.findMany({ where: { ...b, status: "refunded" }, select: { kind: true, code: true, bookingId: true } }),
  ]);
  const st = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const kind = (k: string) => paidByKind.find((p) => p.kind === k);
  const refundCodes = refundDue.map((g) => (g.kind === "game" ? g.bookingId ?? g.code : g.code));
  const refundsPaid = refundCodes.length ? await prisma.paymentEvent.count({ where: { orderCode: { in: refundCodes }, payload: { contains: "REFUND_PAID" } } }) : 0;
  send(res, {
    total, page: pageNo, limit,
    summary: {
      paid: st.paid ?? 0, pending: st.pending ?? 0, expired: st.expired ?? 0, refunded: st.refunded ?? 0,
      refundsDue: Math.max(0, refundCodes.length - refundsPaid),
      revenue: (kind("points")?._sum.amount ?? 0) + (kind("game")?._sum.amount ?? 0),
      pointsGifts: kind("points")?._count._all ?? 0, pointsSold: kind("points")?._sum.points ?? 0, pointsRevenue: kind("points")?._sum.amount ?? 0,
      gameGifts: kind("game")?._count._all ?? 0, gameRevenue: kind("game")?._sum.amount ?? 0,
    },
    items: await views(rows),
  });
}));

giftsRouter.get("/:id", requirePermission("giftcards.view"), handler(async (req, res) => {
  const g = await prisma.gift.findUnique({ where: { id: param(req, "id") } });
  if (!g) throw new AppError(404, "Gift not found");
  send(res, (await views([g]))[0]);
}));

/** Points the friend can still spend (valid earned points minus what they spent). */
async function spendable(phone: string) {
  const today = todayKey();
  const rows = await prisma.loyaltyEntry.findMany({ where: { userId: phone }, select: { points: true, expiresOn: true } });
  const valid = rows.filter((r) => Number(r.points) > 0 && (!r.expiresOn || r.expiresOn >= today)).reduce((n, r) => n + Number(r.points), 0);
  const spent = rows.filter((r) => Number(r.points) < 0).reduce((n, r) => n + Number(r.points), 0);
  return Math.round((valid + spent) * 10) / 10;
}

const REFUND_EVENT = (amount: number, reason: string) => JSON.stringify({ event: "REFUND_DUE", reason: "GIFT_CANCELLED_BY_STAFF", note: reason, amount, method: "fonepay" });

// Cancel a paid gift. Game: the booking is cancelled and the hour freed. Points: the points are taken back from the friend
// (only if they still have them). Either way the buyer's money goes on the Refunds list and both customers are told.
giftsRouter.post("/:id/cancel", requirePermission("giftcards.refund"), handler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body ?? {});
  const g = await prisma.gift.findUnique({ where: { id: param(req, "id") } });
  if (!g) throw new AppError(404, "Gift not found");
  if (g.status !== "paid") throw new AppError(409, g.status === "refunded" ? "This gift is already cancelled" : "Only a paid gift can be cancelled");
  const orderCode = g.kind === "game" ? g.bookingId! : g.code;
  const [buyer, friend] = await Promise.all([
    prisma.user.findUnique({ where: { phoneNumber: g.buyerId }, select: { name: true } }),
    prisma.user.findUnique({ where: { phoneNumber: g.friendId }, select: { name: true } }),
  ]);

  if (g.kind === "game") {
    const b = await prisma.booking.findUnique({ where: { id: g.bookingId! } });
    if (!b) throw new AppError(404, "The booking for this gift was not found");
    if (b.status === "completed") throw new AppError(409, "The game has already been played");
    await prisma.$transaction(async (tx) => {
      if (b.status !== "cancelled") {
        await tx.booking.update({ where: { id: b.id }, data: { status: "cancelled", cancelledAt: new Date(), holdExpiresAt: null, notes: `${b.notes ?? ""} | GIFT_CANCELLED_BY_STAFF` } });
        await tx.bookingSlot.deleteMany({ where: { bookingId: b.id } });
      }
      const r = await tx.paymentOrder.updateMany({ where: { orderCode, status: "paid" }, data: { status: "refunded" } });
      if (r.count) await tx.paymentEvent.create({ data: { orderCode, source: "staff", payload: REFUND_EVENT(g.amount, reason) } });
      await tx.gift.update({ where: { id: g.id }, data: { status: "refunded" } });
    });
    await notify(prisma, { userId: g.friendId, type: "booking", title: "Gifted game cancelled", message: `The game ${firstName(buyer?.name)} gave you on ${b.date} at ${b.startTime} was cancelled by the venue. ${reason}`, href: "/profile", dedupeKey: `gift-cancel-in-${g.id}` });
  } else {
    const left = await spendable(g.friendId);
    const pts = g.points ?? 0;
    if (left < pts) throw new AppError(409, `${firstName(friend?.name)} has only ${left} points left, so the ${pts} gifted points cannot be taken back. They may have spent them on a free game.`);
    await prisma.$transaction(async (tx) => {
      await tx.loyaltyEntry.create({ data: { userId: g.friendId, kind: "free_game", points: new Prisma.Decimal((-pts).toFixed(1)), earnedOn: todayKey(), expiresOn: null, sourceType: "gift_refund", sourceId: g.id, detail: `Gift ${g.code} cancelled by the venue` } });
      const r = await tx.paymentOrder.updateMany({ where: { orderCode, status: "paid" }, data: { status: "refunded" } });
      if (r.count) await tx.paymentEvent.create({ data: { orderCode, source: "staff", payload: REFUND_EVENT(g.amount, reason) } });
      await tx.gift.update({ where: { id: g.id }, data: { status: "refunded" } });
    });
    await notify(prisma, { userId: g.friendId, type: "points", title: "Gifted points taken back", message: `The ${pts} points ${firstName(buyer?.name)} gave you were taken back by the venue. ${reason}`, href: await pointsHref(g.friendId, "gift_refund", g.id), dedupeKey: `gift-cancel-in-${g.id}` });
  }
  await notify(prisma, { userId: g.buyerId, type: "payment", title: "Gift cancelled", message: `Your gift ${g.code} to ${firstName(friend?.name)} was cancelled. Rs. ${g.amount} will be paid back to you. ${reason}`, href: "/gift-card", dedupeKey: `gift-cancel-out-${g.id}` });
  await audit(req, "cancel", "gift", g.id, { code: g.code, kind: g.kind, amount: g.amount, points: g.points, reason });
  send(res, (await views([(await prisma.gift.findUnique({ where: { id: g.id } }))!]))[0], `Gift cancelled. Rs. ${g.amount} is on the Refunds list.`);
}));

/** A gifted game was cancelled somewhere else (Bookings, a closed court): mark the gift and tell the buyer. */
export async function giftBookingCancelled(bookingId: string) {
  const g = await prisma.gift.findUnique({ where: { bookingId } });
  if (!g || g.status !== "paid") return;
  await prisma.gift.update({ where: { id: g.id }, data: { status: "refunded" } });
  const friend = await prisma.user.findUnique({ where: { phoneNumber: g.friendId }, select: { name: true } });
  await notify(prisma, { userId: g.buyerId, type: "payment", title: "Gift cancelled", message: `The game you gave ${firstName(friend?.name)} was cancelled by the venue. Rs. ${g.amount} will be paid back to you.`, href: "/gift-card", dedupeKey: `gift-cancel-out-${g.id}` });
}
