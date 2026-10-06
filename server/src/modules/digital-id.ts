import { randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";
import { customerProfile } from "./customers";

// Digital ID. A customer's QR holds only "UFID1." + a random token (customer app: GET /me/digital-id). It carries no personal
// data, so a scan anywhere else shows nothing. Only staff signed in here can turn it into a customer.
export const digitalIdRouter = Router();

const PREFIX = "UFID1.";
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const DEAD = ["cancelled", "expired"];
const newToken = () => randomBytes(24).toString("base64url");

async function ensureToken(userId: string) {
  const row = await prisma.digitalId.findUnique({ where: { userId } });
  if (row) return row;
  try {
    return await prisma.digitalId.create({ data: { userId, token: newToken() } });
  } catch {
    return (await prisma.digitalId.findUniqueOrThrow({ where: { userId } })); // created at the same moment by the customer
  }
}

const customerOr404 = async (phone: string) => {
  const u = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: { phoneNumber: true, name: true, role: true, isActive: true } });
  if (!u || u.role !== "user") throw new AppError(404, "Customer not found");
  return u;
};

// QR text -> customer. Anything that is not a Unique Futsal ID, or an old (replaced) one, is refused with a clear message.
digitalIdRouter.post("/resolve", requirePermission("digitalid.scan"), handler(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(1).max(200) }), req.body);
  if (!code.startsWith(PREFIX)) throw new AppError(422, "This is not a Unique Futsal ID.");
  const token = code.slice(PREFIX.length);
  if (!TOKEN.test(token)) throw new AppError(422, "This is not a valid Unique Futsal ID.");
  const row = await prisma.digitalId.findUnique({ where: { token } });
  if (!row) throw new AppError(404, "This ID is not recognised. The customer may have replaced it: ask them to open the newest card.");
  const u = await customerOr404(row.userId);
  await audit(req, "digitalid-scan", "customer", u.phoneNumber);
  send(res, { phone: u.phoneNumber, name: u.name });
}));

// Fallback when the camera or the QR does not work.
digitalIdRouter.get("/search", requirePermission("digitalid.scan"), handler(async (req, res) => {
  const q = String((req.query as Record<string, unknown>).q ?? "").trim();
  if (q.length < 2) return send(res, []);
  const rows = await prisma.user.findMany({
    where: { role: "user", OR: [{ name: { contains: q, mode: "insensitive" } }, { phoneNumber: { contains: q } }] },
    select: { phoneNumber: true, name: true, isActive: true },
    orderBy: { name: "asc" }, take: 10,
  });
  send(res, rows);
}));

// The card to send or print. Makes the customer's Digital ID if they never opened theirs (for example just registered).
digitalIdRouter.get("/:phone/card", requirePermission("digitalid.scan"), handler(async (req, res) => {
  const u = await customerOr404(param(req, "phone"));
  const row = await ensureToken(u.phoneNumber);
  await audit(req, "digitalid-card", "customer", u.phoneNumber);
  send(res, { name: u.name || "Player", phone: u.phoneNumber, payload: PREFIX + row.token, whatsapp: `https://wa.me/977${u.phoneNumber}` });
}));

// Record that this member came today. Once per day per membership.
digitalIdRouter.post("/:phone/attendance", requirePermission("digitalid.attendance"), handler(async (req, res) => {
  const u = await customerOr404(param(req, "phone"));
  const sub = await currentMembership(u.phoneNumber);
  if (!sub) throw new AppError(409, "This customer has no active membership today.");
  const today = todayKey();
  const exists = await prisma.membershipAttendance.findUnique({ where: { subscriptionId_date: { subscriptionId: sub.id, date: today } } });
  if (exists) return send(res, { alreadyMarked: true, date: today }, "Attendance was already marked today");
  try {
    await prisma.membershipAttendance.create({ data: { subscriptionId: sub.id, userId: u.phoneNumber, date: today, recordedBy: req.staff!.id } });
  } catch {
    return send(res, { alreadyMarked: true, date: today }, "Attendance was already marked today"); // two staff at once
  }
  await audit(req, "membership-attendance", "customer", u.phoneNumber, { subscriptionId: sub.id, date: today });
  send(res, { alreadyMarked: false, date: today }, "Attendance marked", 201);
}));

// Everything about one customer, for the scan result.
digitalIdRouter.get("/:phone", requirePermission("digitalid.scan"), handler(async (req, res) => {
  const u = await customerOr404(param(req, "phone"));
  const [profile, extras] = await Promise.all([customerProfile(u.phoneNumber), customerExtras(u.phoneNumber)]);
  const spent = {
    games: profile.payments.paid.amount,
    goods: profile.goods.total,
    total: profile.payments.paid.amount + profile.goods.total,
    unpaid: profile.payments.unpaid.amount,
  };
  send(res, { profile, extras: { ...extras, spent } });
}));

async function currentMembership(phone: string) {
  const today = todayKey();
  const subs = await prisma.membershipSubscription.findMany({
    where: { userId: phone, status: "active" },
    include: { plan: { select: { name: true } } },
    orderBy: { endDate: "desc" }, take: 5,
  });
  return subs.find((s) => s.startDate.toISOString().slice(0, 10) <= today && s.endDate.toISOString().slice(0, 10) >= today) ?? null;
}

async function customerExtras(phone: string) {
  const today = todayKey();
  const mine = { AND: [NOT_LEDGER, { OR: [{ userId: phone }, { customerPhone: phone }] }] };
  const live = { status: { notIn: DEAD } };
  const [upcoming, addOnRows, gzRows, gzDone, gzUpcoming, ledger, vouchers, refOut, refIn, refRecent, sub, subCount] = await Promise.all([
    prisma.booking.findMany({
      where: { AND: [mine, { status: { in: ["pending", "confirmed"] }, date: { gte: today } }] },
      orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 10,
    }),
    prisma.booking.findMany({ where: { AND: [mine, live, { OR: [{ addOnsPrice: { gt: 0 } }, { waterBottles: { gt: 0 } }] }] }, orderBy: [{ date: "desc" }], take: 50 }),
    prisma.gzBooking.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.gzBooking.count({ where: { userId: phone, status: "completed" } }),
    prisma.gzBooking.count({ where: { userId: phone, status: "confirmed", date: { gte: today } } }),
    prisma.loyaltyEntry.findMany({ where: { userId: phone }, select: { points: true, expiresOn: true } }),
    prisma.freeGameVoucher.count({ where: { userId: phone, status: "unused" } }),
    prisma.referral.groupBy({ by: ["status"], where: { referrerId: phone }, _count: { _all: true } }),
    prisma.referral.groupBy({ by: ["status"], where: { friendId: phone }, _count: { _all: true } }),
    prisma.referral.findMany({ where: { OR: [{ referrerId: phone }, { friendId: phone }] }, orderBy: { createdAt: "desc" }, take: 5 }),
    currentMembership(phone),
    prisma.membershipSubscription.count({ where: { userId: phone } }),
  ]);

  const valid = ledger.filter((r) => Number(r.points) > 0 && (!r.expiresOn || r.expiresOn >= today)).reduce((n, r) => n + Number(r.points), 0);
  const spentPts = ledger.filter((r) => Number(r.points) < 0).reduce((n, r) => n + Number(r.points), 0);
  const counts = (rows: { status: string; _count: { _all: number } }[]) => ({
    total: rows.reduce((n, r) => n + r._count._all, 0),
    approved: rows.find((r) => r.status === "approved")?._count._all ?? 0,
    pending: rows.find((r) => r.status === "pending")?._count._all ?? 0,
  });

  let membership = null as null | {
    plan: string; memberCode: string | null; timeSlot: string | null; startDate: string; endDate: string; paymentStatus: string;
    attendedToday: boolean; attendanceCount: number; attendanceThisMonth: number; recentDays: string[];
  };
  if (sub) {
    const att = await prisma.membershipAttendance.findMany({ where: { subscriptionId: sub.id }, orderBy: { date: "desc" }, take: 60 });
    const month = today.slice(0, 7);
    membership = {
      plan: sub.plan.name, memberCode: sub.memberCode, timeSlot: sub.timeSlot, paymentStatus: sub.paymentStatus,
      startDate: sub.startDate.toISOString().slice(0, 10), endDate: sub.endDate.toISOString().slice(0, 10),
      attendedToday: att.some((a) => a.date === today), attendanceCount: await prisma.membershipAttendance.count({ where: { subscriptionId: sub.id } }),
      attendanceThisMonth: att.filter((a) => a.date.startsWith(month)).length, recentDays: att.slice(0, 10).map((a) => a.date),
    };
  }

  return {
    upcomingBookings: upcoming.map((b) => ({
      code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, time: b.startTime, status: b.status, amount: b.totalPrice,
      paid: b.paymentStatus === "completed", method: b.paymentMethod,
    })),
    addOns: {
      total: addOnRows.reduce((n, b) => n + b.addOnsPrice, 0),
      bottles: addOnRows.reduce((n, b) => n + b.waterBottles, 0),
      recent: addOnRows.slice(0, 10).map((b) => ({ code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, items: b.addOns, bottles: b.waterBottles, price: b.addOnsPrice })),
    },
    gamezone: {
      completed: gzDone, upcoming: gzUpcoming,
      recent: gzRows.map((g) => ({ code: g.code, game: g.gameTitle, date: g.date, time: `${String(g.startHour).padStart(2, "0")}:00`, hours: g.hours, total: g.total, status: g.status, paymentStatus: g.paymentStatus })),
    },
    loyalty: { points: Math.round((valid + spentPts) * 10) / 10, freeGameVouchers: vouchers },
    referrals: {
      asReferrer: counts(refOut), asFriend: counts(refIn),
      recent: refRecent.map((r) => ({ code: r.code, role: r.referrerId === phone ? "referrer" : "friend", status: r.status, teamName: r.teamName, gameDate: r.gameDate })),
    },
    membership,
    membershipCount: subCount,
  };
}
