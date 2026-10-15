// Unique Club members (the customer app sells the club: Rs. 1,500 for 30 days, 10% off). Staff see who is a member, who
// is about to run out, what the club has earned and how much discount it has given. The club is paid for in the customer
// app (Fonepay), so this page is for looking; the Rs. 1,500 payments are in Payments > Unique Club.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { handler, page, parse, send } from "../lib/http";
import { MATURE_DAYS, MATURE_GAMES } from "../lib/club";
import { requirePermission } from "../middleware/auth";

export const clubRouter = Router();

const DAY = 86_400_000;
const SOON_DAYS = 7;
const filters = z.object({
  status: z.enum(["active", "expiring", "expired"]).optional(),
  q: z.string().trim().max(60).optional(),
});

function whereOf(f: z.infer<typeof filters>, userIds?: string[]): Prisma.ClubMemberWhereInput {
  const now = new Date();
  const soon = new Date(now.getTime() + SOON_DAYS * DAY);
  return {
    ...(f.status === "active" ? { validUntil: { gt: now } } : {}),
    ...(f.status === "expiring" ? { validUntil: { gt: now, lte: soon } } : {}),
    ...(f.status === "expired" ? { validUntil: { lte: now } } : {}),
    ...(f.q ? { userId: { in: userIds ?? [] } } : {}),
  };
}

clubRouter.get("/", requirePermission("club.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const now = new Date();

  // search by name or mobile number
  let userIds: string[] | undefined;
  if (f.q) {
    const users = await prisma.user.findMany({
      where: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { phoneNumber: { contains: f.q } }] },
      select: { phoneNumber: true },
      take: 200,
    });
    userIds = users.map((u) => u.phoneNumber);
  }
  const where = whereOf(f, userIds);

  const [rows, total, active, expiring, expired, revenue] = await Promise.all([
    prisma.clubMember.findMany({ where, orderBy: [{ validUntil: "desc" }], take, skip }),
    prisma.clubMember.count({ where }),
    prisma.clubMember.count({ where: { validUntil: { gt: now } } }),
    prisma.clubMember.count({ where: { validUntil: { gt: now, lte: new Date(now.getTime() + SOON_DAYS * DAY) } } }),
    prisma.clubMember.count({ where: { validUntil: { lte: now } } }),
    prisma.paymentOrder.aggregate({ where: { purpose: "club", status: "paid" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const phones = rows.map((r) => r.userId);
  const [users, courtSaved, gzSaved, games] = await Promise.all([
    prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true, isActive: true } }),
    phones.length ? prisma.booking.groupBy({ by: ["userId"], where: { userId: { in: phones }, clubDiscount: { gt: 0 }, status: { notIn: ["cancelled", "expired"] } }, _sum: { clubDiscount: true }, _count: { _all: true } }) : [],
    phones.length ? prisma.gzBooking.groupBy({ by: ["userId"], where: { userId: { in: phones }, clubDiscount: { gt: 0 }, status: { notIn: ["cancelled", "expired"] } }, _sum: { clubDiscount: true }, _count: { _all: true } }) : [],
    // completed games since each member joined (for the 5-game unlock)
    phones.length ? prisma.booking.findMany({ where: { userId: { in: phones }, status: "completed" }, select: { userId: true, date: true } }) : [],
  ]);
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const court = new Map(courtSaved.map((g) => [g.userId, g]));
  const gz = new Map(gzSaved.map((g) => [g.userId, g]));

  const items = rows.map((m) => {
    const since = m.startedAt.toISOString().slice(0, 10);
    const gamesPlayed = games.filter((g) => g.userId === m.userId && g.date >= since).length;
    const daysIn = Math.max(0, Math.floor((now.getTime() - m.startedAt.getTime()) / DAY));
    const active = m.validUntil.getTime() > now.getTime();
    const daysLeft = active ? Math.ceil((m.validUntil.getTime() - now.getTime()) / DAY) : 0;
    const c = court.get(m.userId), g = gz.get(m.userId);
    return {
      phone: m.userId,
      name: name.get(m.userId) ?? null,
      status: !active ? "expired" : daysLeft <= SOON_DAYS ? "expiring" : "active",
      startedAt: m.startedAt,
      validUntil: m.validUntil,
      lastPaidAt: m.lastPaidAt,
      daysLeft,
      payments: m.payments,
      paidTotal: m.payments * 1500,
      daysIn,
      gamesPlayed,
      mature: active && (daysIn >= MATURE_DAYS || gamesPlayed >= MATURE_GAMES),
      discountGiven: (c?._sum.clubDiscount ?? 0) + (g?._sum.clubDiscount ?? 0),
      discountedGames: (c?._count._all ?? 0) + (g?._count._all ?? 0),
    };
  });

  send(res, {
    total, page: pageNo, limit, matureAfterDays: MATURE_DAYS, matureAfterGames: MATURE_GAMES,
    summary: { active, expiring, expired, members: active + expired, revenue: revenue._sum.amount ?? 0, payments: revenue._count._all },
    items,
  });
}));
