import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";
import { cancellationProfile, cancellationStreaks } from "./cancellations";
import { CATEGORIES } from "./complaints";
import { getPromoCodes } from "./settings-store";

export const customersRouter = Router();

// Never send the password hash or Google ids.
const pub = { phoneNumber: true, name: true, email: true, isActive: true, createdAt: true, freeMatchesAvailable: true, isVerified: true, avatar: true } as const;
const DEAD = ["cancelled", "expired"];

customersRouter.get("/", requirePermission("customers.read"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const captains = q.mode === "captain" || q.mode === "player" ? (await prisma.userPrefs.findMany({ where: { mode: "captain" }, select: { userId: true } })).map((p) => p.userId) : [];
  const where: Prisma.UserWhereInput = {
    role: "user",
    ...(q.status === "suspended" ? { isActive: false } : q.status === "active" ? { isActive: true } : {}),
    ...(q.mode === "captain" ? { phoneNumber: { in: captains } } : q.mode === "player" ? { phoneNumber: { notIn: captains } } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phoneNumber: { contains: q.q } }, { email: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.user.findMany({ where, select: pub, orderBy: { createdAt: "desc" }, take, skip }), prisma.user.count({ where })]);

  // Quick numbers for the rows on this page only
  const phones = rows.map((r) => r.phoneNumber);
  const mine = { AND: [NOT_LEDGER, { userId: { in: phones } }] };
  const [played, paid, unpaid, gz, openComplaints, prefs, streaks] = await Promise.all([
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { status: "completed" }] }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { paymentStatus: "completed", status: { notIn: DEAD } }] }, _sum: { totalPrice: true } }),
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { paymentStatus: { not: "completed" }, status: { notIn: DEAD } }] }, _sum: { totalPrice: true } }),
    prisma.gzBooking.groupBy({ by: ["userId"], where: { userId: { in: phones }, status: "completed" }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["userId"], where: { userId: { in: phones }, status: { in: ["open", "in_review"] } }, _count: { _all: true } }),
    prisma.userPrefs.findMany({ where: { userId: { in: phones } }, select: { userId: true, mode: true } }),
    cancellationStreaks(phones),
  ]);
  const by = <T extends { userId: string | null }>(list: T[]) => new Map(list.map((x) => [x.userId, x]));
  const mPlayed = by(played), mPaid = by(paid), mUnpaid = by(unpaid), mGz = by(gz), mC = by(openComplaints), mMode = new Map(prefs.map((p) => [p.userId, p.mode]));
  const items = rows.map((u) => ({
    ...u,
    mode: mMode.get(u.phoneNumber) ?? "player",
    stats: {
      gamesPlayed: mPlayed.get(u.phoneNumber)?._count._all ?? 0,
      gamezoneSessions: mGz.get(u.phoneNumber)?._count._all ?? 0,
      paidTotal: mPaid.get(u.phoneNumber)?._sum.totalPrice ?? 0,
      unpaidTotal: mUnpaid.get(u.phoneNumber)?._sum.totalPrice ?? 0,
      openComplaints: mC.get(u.phoneNumber)?._count._all ?? 0,
      cancelStreak: streaks.get(u.phoneNumber) ?? 0,
    },
  }));
  send(res, { items, total, page: pageNo, limit });
}));

// Everything staff want to know about one customer, in one call.
customersRouter.get("/:phone/profile", requirePermission("customers.read"), handler(async (req, res) => {
  const phone = param(req, "phone");
  const user = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: pub });
  if (!user) throw new AppError(404, "Customer not found");
  const today = todayKey();
  const mine: Prisma.BookingWhereInput = { AND: [NOT_LEDGER, { OR: [{ userId: phone }, { customerPhone: phone }] }] };
  const live = { status: { notIn: DEAD } };

  const [prefs, played, upcoming, cancelled, noShows, gzDone, first, last, recent, paidRows, unpaidAgg, gzPaid, gzUnpaid, recentGz,
    goodsAgg, goods, cTotal, cOpen, cRecent, regs, member, vipRow, cancellations] = await Promise.all([
    prisma.userPrefs.findUnique({ where: { userId: phone } }),
    prisma.booking.count({ where: { AND: [mine, { status: "completed" }] } }),
    prisma.booking.count({ where: { AND: [mine, { status: { in: ["pending", "confirmed"] }, date: { gte: today } }] } }),
    prisma.booking.count({ where: { AND: [mine, { status: { in: DEAD } }] } }),
    prisma.booking.count({ where: { AND: [mine, { status: "no_show" }] } }),
    prisma.gzBooking.count({ where: { userId: phone, status: "completed" } }),
    prisma.booking.findFirst({ where: { AND: [mine, { status: "completed" }] }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.booking.findFirst({ where: { AND: [mine, { status: "completed" }] }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.booking.findMany({ where: mine, orderBy: [{ date: "desc" }, { startTime: "desc" }], take: 10 }),
    prisma.booking.groupBy({ by: ["paymentMethod"], where: { AND: [mine, { paymentStatus: "completed" }, live] }, _sum: { totalPrice: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { AND: [mine, { paymentStatus: { not: "completed" } }, live] }, _sum: { totalPrice: true }, _count: { _all: true } }),
    prisma.gzBooking.groupBy({ by: ["paymentMethod"], where: { userId: phone, paymentStatus: "paid", ...live }, _sum: { total: true }, _count: { _all: true } }),
    prisma.gzBooking.aggregate({ where: { userId: phone, paymentStatus: { not: "paid" }, ...live }, _sum: { total: true }, _count: { _all: true } }),
    prisma.gzBooking.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.goodsSale.aggregate({ where: { OR: [{ userId: phone }, { phone }] }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.goodsSale.findMany({ where: { OR: [{ userId: phone }, { phone }] }, orderBy: { soldAt: "desc" }, take: 20 }),
    prisma.complaint.count({ where: { userId: phone } }),
    prisma.complaint.count({ where: { userId: phone, status: { in: ["open", "in_review"] } } }),
    prisma.complaint.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.registration.findMany({ where: { contactPhone: phone }, include: { tournament: { select: { name: true, startDate: true, endDate: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.teamMember.findUnique({ where: { userId: phone }, include: { team: true } }),
    prisma.vipCode.findUnique({ where: { userId: phone } }),
    cancellationProfile(phone),
  ]);

  // ---- payments (court + Gamezone) ----
  const sum = (rows: { paymentMethod: string; _sum: { totalPrice?: number | null; total?: number | null }; _count: { _all: number } }[], pick?: (m: string) => boolean) =>
    rows.filter((r) => !pick || pick(r.paymentMethod)).reduce((n, r) => ({ amount: n.amount + (r._sum.totalPrice ?? r._sum.total ?? 0), count: n.count + r._count._all }), { amount: 0, count: 0 });
  const paidAll = [...paidRows, ...gzPaid] as Parameters<typeof sum>[0];
  const paidCash = sum(paidAll, (m) => m === "venue");
  const paidOnline = sum(paidAll, (m) => m !== "venue");
  const payments = {
    paid: { amount: paidCash.amount + paidOnline.amount, count: paidCash.count + paidOnline.count },
    paidCash, paidOnline,
    unpaid: { amount: (unpaidAgg._sum.totalPrice ?? 0) + (gzUnpaid._sum.total ?? 0), count: unpaidAgg._count._all + gzUnpaid._count._all },
    recent: [
      ...recent.map((b) => ({ kind: "court", code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, time: b.startTime, amount: b.totalPrice, status: DEAD.includes(b.status) ? "cancelled" : b.paymentStatus === "completed" ? "paid" : "unpaid", method: b.paymentMethod })),
      ...recentGz.map((g) => ({ kind: "gamezone", code: g.code, date: g.date, time: `${String(g.startHour).padStart(2, "0")}:00`, amount: g.total, status: DEAD.includes(g.status) ? "cancelled" : g.paymentStatus === "paid" ? "paid" : "unpaid", method: g.paymentMethod })),
    ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10),
  };

  // ---- team, captain profile, tournaments ----
  const isCaptain = member?.team.captainId === phone;
  let team = null as null | { id: string; name: string; area: string; role: "captain" | "member"; members: number; record: { played: number; won: number; drawn: number; lost: number } };
  let hosted: { id: string; date: string; startHour: number; status: string; opponent: string | null }[] = [];
  let hostedCount = 0;
  if (member) {
    const [members, results] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: member.teamId } }),
      prisma.challengeResult.findMany({ where: { status: "approved", challenge: { OR: [{ challengerTeamId: member.teamId }, { challengedTeamId: member.teamId }] } } }),
    ]);
    // The submitting team is the winner (or a draw) by rule.
    const record = { played: results.length, won: 0, drawn: 0, lost: 0 };
    for (const r of results) {
      if (r.scoreSubmitter === r.scoreOther) record.drawn++;
      else if (r.submittedByTeamId === member.teamId) record.won++;
      else record.lost++;
    }
    team = { id: member.team.id, name: member.team.name, area: member.team.area, role: isCaptain ? "captain" : "member", members, record };
    if (isCaptain) {
      const list = await prisma.challenge.findMany({ where: { challengerTeamId: member.teamId }, orderBy: { createdAt: "desc" }, take: 5 });
      hostedCount = await prisma.challenge.count({ where: { challengerTeamId: member.teamId } });
      const names = new Map((await prisma.team.findMany({ where: { id: { in: list.map((c) => c.challengedTeamId) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
      hosted = list.map((c) => ({ id: c.id, date: c.date, startHour: c.startHour, status: c.status, opponent: names.get(c.challengedTeamId) ?? null }));
    }
  }

  // ---- VIP code: how much it has been used on real (not cancelled) bookings ----
  const vipUse = vipRow
    ? await prisma.booking.aggregate({ where: { AND: [mine, { promoCode: vipRow.code }, live] }, _count: { _all: true }, _sum: { discountAmount: true } })
    : null;
  send(res, {
    user,
    contact: { phone, whatsapp: `https://wa.me/977${phone}` },
    profile: { mode: prefs?.mode ?? "player", position: prefs?.position ?? null, location: prefs?.location ?? null, isCaptain, team },
    games: {
      played, upcoming, cancelled, noShows, gamezoneSessions: gzDone, firstGame: first?.date ?? null, lastGame: last?.date ?? null,
      recent: recent.map((b) => ({ code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, time: b.startTime, status: b.status, amount: b.totalPrice, paid: b.paymentStatus === "completed" })),
    },
    payments,
    goods: { total: goodsAgg._sum.amount ?? 0, count: goodsAgg._count._all, items: goods.map((g) => ({ id: g.id, amount: g.amount, items: g.items, soldAt: g.soldAt })) },
    complaints: { total: cTotal, open: cOpen, recent: cRecent.map((c) => ({ id: c.id, code: c.code, categoryLabel: CATEGORIES[c.category] ?? c.category, status: c.status, createdAt: c.createdAt })) },
    tournaments: {
      entered: regs.map((r) => ({ id: r.id, teamName: r.teamName, tournament: r.tournament.name, startDate: r.tournament.startDate, status: r.status })),
      challengesHosted: { count: hostedCount, recent: hosted },
    },
    cancellations,
    vip: vipRow && {
      code: vipRow.code, type: vipRow.type, value: vipRow.value, active: vipRow.active, note: vipRow.note, claimedAt: vipRow.claimedAt, createdAt: vipRow.createdAt,
      usage: { games: vipUse?._count._all ?? 0, discountGiven: vipUse?._sum.discountAmount ?? 0 },
    },
  });
}));

// VIP discount code: staff give one customer a special code (for example ADMINVIP) worth a percent or rupees off.
// The customer types it once in the booking screen; after that the customer app applies it to every booking they make.
const vipBody = z.object({
  code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/, "letters and numbers only").transform((c) => c.toUpperCase()),
  type: z.enum(["percent", "flat"]),
  value: z.number().int().min(1, "at least 1"),
  active: z.boolean().default(true),
  note: z.string().trim().max(120).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.type === "percent" && v.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "a percent cannot be more than 100" });
  if (v.type === "flat" && v.value > 100000) ctx.addIssue({ code: "custom", path: ["value"], message: "at most Rs. 100,000" });
});

customersRouter.put("/:phone/vip", requirePermission("customers.write"), handler(async (req, res) => {
  const b = parse(vipBody, req.body);
  const phone = param(req, "phone");
  const u = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: { role: true } });
  if (!u) throw new AppError(404, "Customer not found");
  if (u.role !== "user") throw new AppError(403, "Only customers can have a VIP code");
  // a VIP code must not look like a normal promo code, or the app could not tell them apart
  if ((await getPromoCodes()).some((p) => p.code.trim().toUpperCase() === b.code)) throw new AppError(409, "That is already a normal promo code. Choose a different VIP code.");
  const old = await prisma.vipCode.findUnique({ where: { userId: phone } });
  // a changed code has to be typed by the customer again
  const claimedAt = old && old.code === b.code ? old.claimedAt : null;
  const row = await prisma.vipCode.upsert({
    where: { userId: phone },
    update: { code: b.code, type: b.type, value: b.value, active: b.active, note: b.note ?? null, claimedAt },
    create: { userId: phone, code: b.code, type: b.type, value: b.value, active: b.active, note: b.note ?? null, createdBy: req.staff!.id },
  });
  await audit(req, old ? "vip-update" : "vip-give", "customer", phone, { code: b.code, type: b.type, value: b.value, active: b.active });
  send(res, { code: row.code, type: row.type, value: row.value, active: row.active, note: row.note, claimedAt: row.claimedAt }, old ? "VIP code saved" : "VIP code given", old ? 200 : 201);
}));

customersRouter.delete("/:phone/vip", requirePermission("customers.write"), handler(async (req, res) => {
  const phone = param(req, "phone");
  const old = await prisma.vipCode.findUnique({ where: { userId: phone } });
  if (!old) throw new AppError(404, "This customer has no VIP code");
  await prisma.vipCode.delete({ where: { userId: phone } });
  await audit(req, "vip-remove", "customer", phone, { code: old.code });
  send(res, null, "VIP code removed");
}));

customersRouter.get("/:phone", requirePermission("customers.read"), handler(async (req, res) => {
  const phone = param(req, "phone");
  const user = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: pub });
  if (!user) throw new AppError(404, "Customer not found");
  const [prefs, bookings, gz, ledger, vouchers, member] = await Promise.all([
    prisma.userPrefs.findUnique({ where: { userId: phone } }),
    prisma.booking.findMany({ where: { OR: [{ userId: phone }, { customerPhone: phone }] }, orderBy: [{ date: "desc" }, { startTime: "desc" }], take: 30 }),
    prisma.gzBooking.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.loyaltyEntry.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.freeGameVoucher.findMany({ where: { userId: phone }, orderBy: { claimedAt: "desc" }, take: 20 }),
    prisma.teamMember.findUnique({ where: { userId: phone }, include: { team: true } }),
  ]);
  const points = ledger.reduce((n, e) => n + Number(e.points), 0);
  send(res, { user, prefs, bookings, gamezone: gz, loyalty: { balanceBeforeExpiry: Math.round(points * 10) / 10, ledger, vouchers }, team: member?.team ?? null });
}));

customersRouter.patch("/:phone", requirePermission("customers.write"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(60).optional(), email: z.string().email().nullable().optional() }), req.body);
  const phone = param(req, "phone");
  if (!(await prisma.user.findUnique({ where: { phoneNumber: phone } }))) throw new AppError(404, "Customer not found");
  try {
    const u = await prisma.user.update({ where: { phoneNumber: phone }, data: b, select: pub });
    await audit(req, "update", "customer", phone, b);
    send(res, u, "Customer updated");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That email is used by another account");
    throw e;
  }
}));

async function setActive(req: import("express").Request, active: boolean) {
  const phone = param(req, "phone");
  const u = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  if (!u) throw new AppError(404, "Customer not found");
  if (u.role !== "user") throw new AppError(403, "Staff and admin accounts are managed under Staff");
  await prisma.user.update({ where: { phoneNumber: phone }, data: { isActive: active } });
  await audit(req, active ? "unsuspend" : "suspend", "customer", phone);
}

customersRouter.post("/:phone/suspend", requirePermission("customers.write"), handler(async (req, res) => { await setActive(req, false); send(res, null, "Customer suspended"); }));
customersRouter.post("/:phone/unsuspend", requirePermission("customers.write"), handler(async (req, res) => { await setActive(req, true); send(res, null, "Customer reactivated"); }));
