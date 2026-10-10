// Payments screen: one row per court booking or Gamezone session, with paid / unpaid status and how it is paid.
//   status: paid (money received) | unpaid (still to collect) | cancelled (cancelled or expired, nothing owed)
//   mode:   cash (pay at venue) | online (Fonepay; older eSewa payments still count as online)
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { dateStr, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { gzSplits } from "../lib/gz-pay";
import { NOT_LEDGER } from "./bookings";

export const ledgerRouter = Router();

const DEAD = ["cancelled", "expired"];
const filters = z.object({
  kind: z.enum(["court", "gamezone"]).default("court"),
  status: z.enum(["paid", "unpaid", "cancelled"]).optional(),
  mode: z.enum(["cash", "online", "esewa", "fonepay"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  q: z.string().trim().max(60).optional(),
});
type F = z.infer<typeof filters>;

const methods = (mode?: F["mode"]) => (mode === "cash" ? ["venue"] : mode === "online" ? ["esewa", "fonepay"] : mode ? [mode] : undefined);
const dateRange = (f: F) => (f.from || f.to ? { date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {});

// Everything except the status, so the summary can count paid and unpaid separately.
function courtBase(f: F): Prisma.BookingWhereInput {
  const m = methods(f.mode);
  return {
    AND: [
      NOT_LEDGER, dateRange(f), ...(m ? [{ paymentMethod: { in: m } }] : []),
      ...(f.q ? [{ OR: [{ code: { contains: f.q, mode: "insensitive" as const } }, { customerName: { contains: f.q, mode: "insensitive" as const } }, { customerPhone: { contains: f.q } }, { userId: { contains: f.q } }] }] : []),
    ],
  };
}
const courtStatus = (s?: F["status"]): Prisma.BookingWhereInput =>
  s === "paid" ? { paymentStatus: "completed", status: { notIn: DEAD } }
    : s === "unpaid" ? { paymentStatus: { not: "completed" }, status: { notIn: DEAD } }
    : s === "cancelled" ? { status: { in: DEAD } } : {};

function gzBase(f: F): Prisma.GzBookingWhereInput {
  const m = methods(f.mode);
  return {
    AND: [
      dateRange(f), ...(m ? [{ paymentMethod: { in: m } }] : []),
      ...(f.q ? [{ OR: [{ code: { contains: f.q, mode: "insensitive" as const } }, { guestName: { contains: f.q, mode: "insensitive" as const } }, { guestPhone: { contains: f.q } }, { userId: { contains: f.q } }] }] : []),
    ],
  };
}
const gzStatus = (s?: F["status"]): Prisma.GzBookingWhereInput =>
  s === "paid" ? { paymentStatus: "paid", status: { notIn: DEAD } }
    : s === "unpaid" ? { paymentStatus: { not: "paid" }, status: { notIn: DEAD } }
    : s === "cancelled" ? { status: { in: DEAD } } : {};

const modeOf = (method: string) => (method === "venue" ? "cash" : "online");

ledgerRouter.get("/ledger", requirePermission("payments.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);

  if (f.kind === "gamezone") {
    const where: Prisma.GzBookingWhereInput = { AND: [gzBase(f), gzStatus(f.status)] };
    const [rows, total] = await Promise.all([prisma.gzBooking.findMany({ where, orderBy: [{ date: "desc" }, { startHour: "desc" }], take, skip }), prisma.gzBooking.count({ where })]);
    const users = await prisma.user.findMany({ where: { phoneNumber: { in: rows.flatMap((r) => (r.userId ? [r.userId] : [])) } }, select: { phoneNumber: true, name: true } });
    const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
    return send(res, {
      total, page: pageNo, limit,
      items: rows.map((r) => ({
        kind: "gamezone", id: r.id, ref: r.code, code: r.code, date: r.date, time: `${String(r.startHour).padStart(2, "0")}:00`,
        customer: r.guestName ?? (r.userId ? name.get(r.userId) ?? null : null), phone: r.guestPhone ?? r.userId, amount: r.total,
        status: DEAD.includes(r.status) ? "cancelled" : r.paymentStatus === "paid" ? "paid" : "unpaid", method: r.paymentMethod, mode: modeOf(r.paymentMethod), createdAt: r.createdAt,
      })),
    });
  }

  const where: Prisma.BookingWhereInput = { AND: [courtBase(f), courtStatus(f.status)] };
  const [rows, total] = await Promise.all([prisma.booking.findMany({ where, orderBy: [{ date: "desc" }, { startTime: "desc" }], take, skip }), prisma.booking.count({ where })]);
  send(res, {
    total, page: pageNo, limit,
    items: rows.map((r) => ({
      kind: "court", id: r.id, ref: r.id, code: r.code ?? "UF-" + r.id.slice(-6).toUpperCase(), date: r.date, time: r.startTime,
      customer: r.customerName, phone: r.customerPhone ?? r.userId, amount: r.totalPrice,
      status: DEAD.includes(r.status) ? "cancelled" : r.paymentStatus === "completed" ? "paid" : "unpaid", method: r.paymentMethod, mode: modeOf(r.paymentMethod), createdAt: r.createdAt,
    })),
  });
}));

// Totals for the cards above the list. They follow the date, mode and search filters, but not the status filter.
ledgerRouter.get("/summary", requirePermission("payments.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  type Row = { method: string; sum: number; count: number };
  const group = async (paid: boolean): Promise<Row[]> => {
    if (f.kind === "gamezone") {
      const rows = await prisma.gzBooking.findMany({ where: { AND: [gzBase(f), gzStatus(paid ? "paid" : "unpaid")] }, select: { code: true, total: true, paymentMethod: true } });
      // A part cash, part Fonepay session adds its cash to Cash and its Fonepay to Online; it is counted once, under the method that paid most.
      const split = await gzSplits(rows);
      const out: Record<"venue" | "fonepay", Row> = { venue: { method: "venue", sum: 0, count: 0 }, fonepay: { method: "fonepay", sum: 0, count: 0 } };
      for (const r of rows) {
        const s = paid ? split.get(r.code)! : { cash: r.paymentMethod === "venue" ? r.total : 0, fonepay: r.paymentMethod === "venue" ? 0 : r.total };
        out.venue.sum += s.cash; out.fonepay.sum += s.fonepay;
        out[s.cash >= s.fonepay ? "venue" : "fonepay"].count += 1;
      }
      return [out.venue, out.fonepay];
    }
    const g = await prisma.booking.groupBy({ by: ["paymentMethod"], where: { AND: [courtBase(f), courtStatus(paid ? "paid" : "unpaid")] }, _sum: { totalPrice: true }, _count: { _all: true } });
    return g.map((r) => ({ method: r.paymentMethod, sum: r._sum.totalPrice ?? 0, count: r._count._all }));
  };
  const [paid, unpaid, cancelled] = await Promise.all([
    group(true), group(false),
    f.kind === "gamezone" ? prisma.gzBooking.count({ where: { AND: [gzBase(f), gzStatus("cancelled")] } }) : prisma.booking.count({ where: { AND: [courtBase(f), courtStatus("cancelled")] } }),
  ]);
  const tot = (rows: Row[], pick?: (m: string) => boolean) => rows.filter((r) => !pick || pick(r.method)).reduce((n, r) => ({ sum: n.sum + r.sum, count: n.count + r.count }), { sum: 0, count: 0 });
  send(res, {
    paid: tot(paid), unpaid: tot(unpaid), cancelled,
    paidCash: tot(paid, (m) => m === "venue"), paidOnline: tot(paid, (m) => m !== "venue"),
    paidEsewa: tot(paid, (m) => m === "esewa"), paidFonepay: tot(paid, (m) => m === "fonepay"),
    unpaidCash: tot(unpaid, (m) => m === "venue"), unpaidOnline: tot(unpaid, (m) => m !== "venue"),
  });
}));
