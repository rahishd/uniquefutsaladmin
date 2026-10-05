// Arrivals screen: all of today's court bookings and Gamezone sessions, with who has tapped "I'm coming".
// The page splits them into On the way / Not confirmed yet / Finished using nowMinutes and the check-in time.
import { Router } from "express";
import { prisma } from "../db";
import { nowMinutes, todayKey } from "../lib/dates";
import { handler, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";

export const arrivalsRouter = Router();

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const DEAD = ["cancelled", "expired"];

arrivalsRouter.get("/", requirePermission("bookings.read"), handler(async (_req, res) => {
  const today = todayKey();
  const [bookings, gz] = await Promise.all([
    prisma.booking.findMany({ where: { AND: [NOT_LEDGER, { date: today, status: { notIn: DEAD } }] } }),
    prisma.gzBooking.findMany({ where: { date: today, status: { notIn: DEAD } } }),
  ]);
  const [checkins, users] = await Promise.all([
    prisma.arrivalCheckin.findMany({ where: { refId: { in: [...bookings.map((b) => b.id), ...gz.map((g) => g.code)] } } }),
    prisma.user.findMany({ where: { phoneNumber: { in: [...bookings, ...gz].flatMap((x) => (x.userId ? [x.userId] : [])) } }, select: { phoneNumber: true, name: true } }),
  ]);
  const at = new Map(checkins.map((c) => [c.refId, c.confirmedAt]));
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));

  const items = [
    ...bookings.map((b) => ({
      kind: "court" as const, id: b.id, ref: b.id, code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(),
      time: b.startTime, endTime: b.endTime, name: b.customerName ?? (b.userId ? name.get(b.userId) ?? null : null), phone: b.customerPhone ?? b.userId,
      amount: b.totalPrice, paid: b.paymentStatus === "completed", method: b.paymentMethod, status: b.status, checkedInAt: at.get(b.id) ?? b.checkedInAt ?? null,
    })),
    ...gz.map((g) => ({
      kind: "gamezone" as const, id: g.id, ref: g.code, code: g.code,
      time: hh(g.startHour), endTime: hh(g.startHour + g.hours), name: g.guestName ?? (g.userId ? name.get(g.userId) ?? null : null), phone: g.guestPhone ?? g.userId,
      amount: g.total, paid: g.paymentStatus === "paid", method: g.paymentMethod, status: g.status, checkedInAt: at.get(g.code) ?? null,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  send(res, { date: today, nowMinutes: nowMinutes(), items });
}));
