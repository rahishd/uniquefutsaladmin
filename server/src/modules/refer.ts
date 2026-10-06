// Refer & Earn, staff side. A customer books a game for another team and files it in the app (customer backend /refer).
// Staff check it here. Approving writes the loyalty points for BOTH people; the app never writes points.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify } from "../lib/customer-effects";
import { todayKey } from "../lib/dates";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getSetting, setSetting } from "./settings-store";

export const referRouter = Router();

const KEY = "referEarn";
type Rules = { enabled: boolean; referrerPoints: number; friendPoints: number };
const DEFAULTS: Rules = { enabled: true, referrerPoints: 10, friendPoints: 10 };
const STATUSES = ["pending", "approved", "rejected"] as const;
const pts = z.number().min(0, "0 or more").max(200, "200 at most").transform((n) => Math.round(n * 10) / 10);

async function getRules(): Promise<Rules> {
  const v = await getSetting(KEY);
  if (v) {
    try {
      const j = JSON.parse(v) as Partial<Rules>;
      return { enabled: j.enabled !== false, referrerPoints: Number.isFinite(j.referrerPoints) ? Number(j.referrerPoints) : DEFAULTS.referrerPoints, friendPoints: Number.isFinite(j.friendPoints) ? Number(j.friendPoints) : DEFAULTS.friendPoints };
    } catch { /* defaults */ }
  }
  return DEFAULTS;
}

const num = (d: Prisma.Decimal) => Number(d);
type Row = Prisma.ReferralGetPayload<object>;

async function withPeople(rows: Row[]) {
  const phones = [...new Set(rows.flatMap((r) => [r.referrerId, r.friendId]))];
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const bookings = await prisma.booking.findMany({ where: { id: { in: rows.map((r) => r.bookingId) } }, select: { id: true, status: true, paymentStatus: true, totalPrice: true } });
  const b = new Map(bookings.map((x) => [x.id, x]));
  return rows.map((r) => ({
    id: r.id, code: r.code, status: r.status, teamName: r.teamName, bookingCode: r.bookingCode, gameDate: r.gameDate, gameTime: r.gameTime,
    referrerPhone: r.referrerId, referrerName: name.get(r.referrerId) ?? null, friendPhone: r.friendId, friendName: name.get(r.friendId) ?? null,
    referrerPoints: num(r.referrerPoints), friendPoints: num(r.friendPoints), staffNote: r.staffNote, decidedAt: r.decidedAt, createdAt: r.createdAt,
    booking: b.get(r.bookingId) ? { status: b.get(r.bookingId)!.status, paymentStatus: b.get(r.bookingId)!.paymentStatus, total: b.get(r.bookingId)!.totalPrice } : null,
  }));
}

// ---------- overview and settings ----------
referRouter.get("/overview", requirePermission("refer.view"), handler(async (_req, res) => {
  const [pending, approved, rejected, sums] = await Promise.all([
    prisma.referral.count({ where: { status: "pending" } }), prisma.referral.count({ where: { status: "approved" } }), prisma.referral.count({ where: { status: "rejected" } }),
    prisma.referral.aggregate({ where: { status: "approved" }, _sum: { referrerPoints: true, friendPoints: true } }),
  ]);
  const given = num(sums._sum.referrerPoints ?? new Prisma.Decimal(0)) + num(sums._sum.friendPoints ?? new Prisma.Decimal(0));
  send(res, { pending, approved, rejected, pointsGiven: Math.round(given * 10) / 10, rules: await getRules() });
}));

referRouter.get("/settings", requirePermission("refer.view"), handler(async (_req, res) => send(res, await getRules())));

referRouter.put("/settings", requirePermission("refer.settings"), handler(async (req, res) => {
  const b = parse(z.object({ enabled: z.boolean(), referrerPoints: pts, friendPoints: pts }), req.body);
  await setSetting(KEY, JSON.stringify(b));
  await audit(req, "update", "refer_settings", null, b);
  send(res, b, b.enabled ? "Saved. New referrals use these points." : "Saved. Refer & Earn is paused for customers.");
}));

// ---------- list ----------
referRouter.get("/", requirePermission("refer.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const status = q.status && (STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;
  const text = q.q?.trim().slice(0, 60);
  const byName = text ? await prisma.user.findMany({ where: { name: { contains: text, mode: "insensitive" } }, select: { phoneNumber: true }, take: 50 }) : [];
  const phones = byName.map((u) => u.phoneNumber);
  const where: Prisma.ReferralWhereInput = {
    ...(status ? { status } : {}),
    ...(text ? { OR: [{ code: { contains: text, mode: "insensitive" } }, { bookingCode: { contains: text, mode: "insensitive" } }, { teamName: { contains: text, mode: "insensitive" } }, { referrerId: { contains: text } }, { friendId: { contains: text } }, { referrerId: { in: phones } }, { friendId: { in: phones } }] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.referral.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.referral.count({ where })]);
  send(res, { items: await withPeople(rows), total, page: pageNo, limit });
}));

referRouter.get("/counts", requirePermission("refer.view"), handler(async (_req, res) => {
  const g = await prisma.referral.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const r of g) { out[r.status] = r._count._all; out.all += r._count._all; }
  send(res, out);
}));

async function find(req: Parameters<typeof param>[0]) {
  const r = await prisma.referral.findFirst({ where: { OR: [{ id: param(req, "id") }, { code: param(req, "id") }] } });
  if (!r) throw new AppError(404, "Referral not found");
  return r;
}

// ---------- decide ----------
// Change the points before deciding (pending only)
referRouter.patch("/:id", requirePermission("refer.review"), handler(async (req, res) => {
  const b = parse(z.object({ referrerPoints: pts.optional(), friendPoints: pts.optional() }), req.body);
  const r = await find(req);
  if (r.status !== "pending") throw new AppError(409, `This referral is already ${r.status}. Use Adjust points instead.`);
  const upd = await prisma.referral.update({ where: { id: r.id }, data: { ...(b.referrerPoints !== undefined ? { referrerPoints: new Prisma.Decimal(b.referrerPoints.toFixed(1)) } : {}), ...(b.friendPoints !== undefined ? { friendPoints: new Prisma.Decimal(b.friendPoints.toFixed(1)) } : {}) } });
  await audit(req, "update", "referral", r.id, { code: r.code, ...b });
  send(res, (await withPeople([upd]))[0], "Saved");
}));

referRouter.post("/:id/approve", requirePermission("refer.review"), handler(async (req, res) => {
  const b = parse(z.object({ referrerPoints: pts.optional(), friendPoints: pts.optional() }), req.body ?? {});
  const r = await find(req);
  if (r.status !== "pending") throw new AppError(409, `This referral is already ${r.status}.`);
  const booking = await prisma.booking.findUnique({ where: { id: r.bookingId }, select: { status: true } });
  if (!booking || ["cancelled", "expired", "rejected"].includes(booking.status)) throw new AppError(409, "The booking was cancelled, so this referral cannot be approved. Reject it instead.");
  const referrerPoints = b.referrerPoints ?? num(r.referrerPoints);
  const friendPoints = b.friendPoints ?? num(r.friendPoints);
  // claim it first: only one request can move it from pending, so points are never given twice
  const claimed = await prisma.referral.updateMany({
    where: { id: r.id, status: "pending" },
    data: { status: "approved", decidedBy: req.staff!.id, decidedAt: new Date(), staffNote: null, referrerPoints: new Prisma.Decimal(referrerPoints.toFixed(1)), friendPoints: new Prisma.Decimal(friendPoints.toFixed(1)) },
  });
  if (claimed.count === 0) throw new AppError(409, "Someone else just decided this referral.");
  const earnedOn = todayKey();
  await awardPoints({ userId: r.referrerId, kind: "referral", points: referrerPoints, sourceType: "referral", sourceId: `${r.id}:referrer`, detail: `Refer & Earn: you booked for ${r.teamName}`, earnedOn });
  await awardPoints({ userId: r.friendId, kind: "referral", points: friendPoints, sourceType: "referral", sourceId: `${r.id}:friend`, detail: `Refer & Earn: a game was booked for your team`, earnedOn });
  await notify(prisma, { userId: r.referrerId, type: "referral", title: "Referral approved", message: `Your referral for ${r.teamName} was approved: +${referrerPoints} points.`, href: "/refer", dedupeKey: `referral-ok-${r.id}-referrer` });
  await notify(prisma, { userId: r.friendId, type: "referral", title: "Referral approved", message: `A game booked for your team was approved: +${friendPoints} points.`, href: "/refer", dedupeKey: `referral-ok-${r.id}-friend` });
  await audit(req, "approve", "referral", r.id, { code: r.code, referrerPoints, friendPoints });
  send(res, (await withPeople([(await prisma.referral.findUnique({ where: { id: r.id } }))!]))[0], "Approved. Both customers got their points.");
}));

referRouter.post("/:id/reject", requirePermission("refer.review"), handler(async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write a short reason").max(200) }), req.body);
  const r = await find(req);
  const claimed = await prisma.referral.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "rejected", staffNote: b.reason, decidedBy: req.staff!.id, decidedAt: new Date() } });
  if (claimed.count === 0) throw new AppError(409, `This referral is already ${r.status}.`);
  await notify(prisma, { userId: r.referrerId, type: "referral", title: "Referral not approved", message: `Your referral for ${r.teamName} was not approved: ${b.reason}`, href: "/refer", dedupeKey: `referral-no-${r.id}` });
  await audit(req, "reject", "referral", r.id, { code: r.code, reason: b.reason });
  send(res, (await withPeople([(await prisma.referral.findUnique({ where: { id: r.id } }))!]))[0], "Rejected. The customer has been told.");
}));

// After approval: set what each person should have in total. The difference is added to or taken from their points.
referRouter.post("/:id/adjust", requirePermission("refer.adjust"), handler(async (req, res) => {
  const b = parse(z.object({ referrerPoints: pts, friendPoints: pts, reason: z.string().trim().min(5, "Write a reason (5+ characters)").max(200) }), req.body);
  const r = await find(req);
  if (r.status !== "approved") throw new AppError(409, "Only an approved referral can be adjusted.");
  const stamp = Date.now();
  const changes: { who: string; side: "referrer" | "friend"; delta: number }[] = [
    { who: r.referrerId, side: "referrer", delta: Math.round((b.referrerPoints - num(r.referrerPoints)) * 10) / 10 },
    { who: r.friendId, side: "friend", delta: Math.round((b.friendPoints - num(r.friendPoints)) * 10) / 10 },
  ];
  if (changes.every((c) => c.delta === 0)) throw new AppError(409, "Nothing changed");
  for (const c of changes) {
    if (c.delta === 0) continue;
    const detail = `Refer & Earn adjustment: ${b.reason}`;
    if (c.delta > 0) await awardPoints({ userId: c.who, kind: "referral", points: c.delta, sourceType: "referral-adjust", sourceId: `${r.id}:${c.side}:${stamp}`, detail });
    else {
      await prisma.loyaltyEntry.create({ data: { userId: c.who, kind: "free_game", points: new Prisma.Decimal(c.delta.toFixed(1)), earnedOn: todayKey(), expiresOn: null, sourceType: "referral-adjust", sourceId: `${r.id}:${c.side}:${stamp}`, detail } });
      await notify(prisma, { userId: c.who, type: "points", title: "Points adjusted", message: `${c.delta} points: ${b.reason}`, href: "/points" });
    }
  }
  const upd = await prisma.referral.update({ where: { id: r.id }, data: { referrerPoints: new Prisma.Decimal(b.referrerPoints.toFixed(1)), friendPoints: new Prisma.Decimal(b.friendPoints.toFixed(1)) } });
  await audit(req, "adjust", "referral", r.id, { code: r.code, referrerPoints: b.referrerPoints, friendPoints: b.friendPoints, reason: b.reason });
  send(res, (await withPeople([upd]))[0], "Points adjusted for both customers.");
}));
