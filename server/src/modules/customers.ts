import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";
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
  const [played, paid, unpaid, gz, openComplaints, prefs] = await Promise.all([
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { status: "completed" }] }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { paymentStatus: "completed", status: { notIn: DEAD } }] }, _sum: { totalPrice: true } }),
    prisma.booking.groupBy({ by: ["userId"], where: { AND: [...mine.AND, { paymentStatus: { not: "completed" }, status: { notIn: DEAD } }] }, _sum: { totalPrice: true } }),
    prisma.gzBooking.groupBy({ by: ["userId"], where: { userId: { in: phones }, status: "completed" }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["userId"], where: { userId: { in: phones }, status: { in: ["open", "in_review"] } }, _count: { _all: true } }),
    prisma.userPrefs.findMany({ where: { userId: { in: phones } }, select: { userId: true, mode: true } }),
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
    goodsAgg, goods, cTotal, cOpen, cRecent, regs, member, rules, promos] = await Promise.all([
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
    prisma.customerPromoRule.findMany({ where: { userId: phone } }),
    getPromoCodes(),
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

  // ---- promo codes: all on unless staff switched them off ----
  const blocked = new Set(rules.map((r) => r.code));
  const known = new Set(promos.map((p) => p.code.trim().toUpperCase()));
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
    promos: {
      allOff: blocked.has("*"),
      codes: [
        ...promos.map((p) => ({ code: p.code, label: p.label, active: p.isActive !== false, expiryDate: p.expiryDate ?? null, enabled: !blocked.has("*") && !blocked.has(p.code.trim().toUpperCase()) })),
        // switched off earlier but since removed from the promo list: still shown so staff can clear them
        ...[...blocked].filter((c) => c !== "*" && !known.has(c)).map((c) => ({ code: c, label: "(removed code)", active: false, expiryDate: null, enabled: false })),
      ],
    },
  });
}));

// Switch one promo code (or all, code "*") on or off for a customer. Remembered: the customer app checks it at every later booking.
customersRouter.put("/:phone/promos", requirePermission("customers.write"), handler(async (req, res) => {
  const b = parse(z.object({ code: z.string().trim().min(1).max(20).regex(/^(\*|[A-Za-z0-9]+)$/, "a promo code or *").transform((s) => s.toUpperCase()), enabled: z.boolean() }), req.body);
  const phone = param(req, "phone");
  const u = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: { role: true } });
  if (!u) throw new AppError(404, "Customer not found");
  if (u.role !== "user") throw new AppError(403, "Only customers have promo settings");
  if (b.code !== "*") {
    const exists = (await getPromoCodes()).some((p) => p.code.trim().toUpperCase() === b.code) || !!(await prisma.customerPromoRule.findFirst({ where: { userId: phone, code: b.code } }));
    if (!exists) throw new AppError(404, "That promo code does not exist");
  }
  if (b.enabled) await prisma.customerPromoRule.deleteMany({ where: { userId: phone, code: b.code } });
  else await prisma.customerPromoRule.upsert({ where: { userId_code: { userId: phone, code: b.code } }, update: {}, create: { userId: phone, code: b.code, createdBy: req.staff!.id } });
  await audit(req, b.enabled ? "promo-enable" : "promo-disable", "customer", phone, { code: b.code });
  const rules = await prisma.customerPromoRule.findMany({ where: { userId: phone }, select: { code: true } });
  send(res, { disabled: rules.map((r) => r.code) }, b.enabled ? "Promo code switched on for this customer" : "Promo code switched off for this customer");
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
