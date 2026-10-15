// Unique Goal Rush (the penalty game in the customer app): what staff see. Everything here is read from the saved games
// and the loyalty ledger; nothing is edited. A reward that has to be corrected is corrected in Loyalty Points > Adjust,
// which records the staff member, the reason and the time.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const goalRushRouter = Router();

const FAST_MS = 8_000; // five penalties, each with a run-up and a flight, take longer than this

const filters = z.object({
  status: z.enum(["completed", "abandoned", "active"]).optional(),
  rewarded: z.enum(["yes", "no"]).optional(),
  q: z.string().trim().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function totals(where: Prisma.GoalRushGameWhereInput) {
  const [agg, completed, abandoned, rewarded, players] = await Promise.all([
    prisma.goalRushGame.aggregate({ where, _count: { _all: true }, _sum: { goals: true, saves: true, misses: true, points: true, shotsTaken: true } }),
    prisma.goalRushGame.count({ where: { AND: [where, { status: "completed" }] } }),
    prisma.goalRushGame.count({ where: { AND: [where, { status: "abandoned" }] } }),
    prisma.goalRushGame.count({ where: { AND: [where, { points: { gt: 0 } }] } }),
    prisma.goalRushGame.groupBy({ by: ["userId"], where }),
  ]);
  return {
    games: agg._count._all, completed, abandoned, rewarded, players: players.length,
    shots: agg._sum.shotsTaken ?? 0, goals: agg._sum.goals ?? 0, saves: agg._sum.saves ?? 0, misses: agg._sum.misses ?? 0, points: agg._sum.points ?? 0,
  };
}

goalRushRouter.get("/", requirePermission("goalrush.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  let userIds: string[] | undefined;
  if (f.q) {
    const users = await prisma.user.findMany({ where: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { phoneNumber: { contains: f.q } }] }, select: { phoneNumber: true }, take: 200 });
    userIds = users.map((u) => u.phoneNumber);
  }
  const where: Prisma.GoalRushGameWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.rewarded === "yes" ? { points: { gt: 0 } } : f.rewarded === "no" ? { points: 0 } : {}),
    ...(userIds ? { userId: { in: userIds } } : {}),
    ...(f.from || f.to ? { day: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };

  const since14 = addDaysKey(today, -13);
  const since7 = addDaysKey(today, -6);
  const [all, todayT, monthT, byDayRows, rows, total, week] = await Promise.all([
    totals({}),
    totals({ day: today }),
    totals({ day: { gte: monthStart } }),
    prisma.goalRushGame.groupBy({ by: ["day"], where: { day: { gte: since14 } }, _count: { _all: true }, _sum: { goals: true, points: true } }),
    prisma.goalRushGame.findMany({ where, orderBy: { startedAt: "desc" }, take, skip }),
    prisma.goalRushGame.count({ where }),
    prisma.goalRushGame.findMany({ where: { day: { gte: since7 } }, select: { userId: true, status: true, goals: true, startedAt: true, finishedAt: true } }),
  ]);

  // the last 14 days, one row per day (days without games included)
  const byDayMap = new Map(byDayRows.map((r) => [r.day, r]));
  const byDay = Array.from({ length: 14 }, (_, i) => {
    const d = addDaysKey(since14, i);
    const r = byDayMap.get(d);
    return { day: d, games: r?._count._all ?? 0, goals: r?._sum.goals ?? 0, points: r?._sum.points ?? 0 };
  });

  // things worth a look (the last 7 days)
  type Flag = { phone: string; reasons: string[]; games: number };
  const per = new Map<string, { games: number; perfect: number; fast: number; abandoned: number }>();
  for (const g of week) {
    const p = per.get(g.userId) ?? { games: 0, perfect: 0, fast: 0, abandoned: 0 };
    p.games++;
    if (g.status === "completed" && g.goals === 5) p.perfect++;
    if (g.status === "completed" && g.finishedAt && g.finishedAt.getTime() - g.startedAt.getTime() < FAST_MS) p.fast++;
    if (g.status === "abandoned") p.abandoned++;
    per.set(g.userId, p);
  }
  const flags: Flag[] = [];
  for (const [phone, p] of per) {
    const reasons: string[] = [];
    if (p.perfect >= 3) reasons.push(`${p.perfect} perfect 5/5 games`);
    if (p.fast >= 2) reasons.push(`${p.fast} games finished in under ${FAST_MS / 1000} seconds`);
    if (p.abandoned >= 6) reasons.push(`${p.abandoned} games left unfinished`);
    if (reasons.length) flags.push({ phone, reasons, games: p.games });
  }

  const phones = [...new Set([...rows.map((r) => r.userId), ...flags.map((f) => f.phone)])];
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));

  send(res, {
    totals: { all, today: todayT, month: monthT },
    byDay,
    flags: flags.map((x) => ({ ...x, name: name.get(x.phone) ?? null })),
    total, page: pageNo, limit,
    items: rows.map((g) => ({
      id: g.id, phone: g.userId, name: name.get(g.userId) ?? null, day: g.day, status: g.status,
      shots: g.shotsTaken, goals: g.goals, saves: g.saves, misses: g.misses, points: g.points, rewardId: g.rewardId,
      startedAt: g.startedAt, finishedAt: g.finishedAt,
      seconds: g.finishedAt ? Math.round((g.finishedAt.getTime() - g.startedAt.getTime()) / 1000) : null,
    })),
  });
}));

// One game shot by shot (for checking a complaint or a flagged player)
goalRushRouter.get("/:id", requirePermission("goalrush.view"), handler(async (req, res) => {
  const g = await prisma.goalRushGame.findUnique({ where: { id: String(req.params.id) }, include: { shots: { orderBy: { no: "asc" } } } });
  if (!g) throw new AppError(404, "Game not found");
  const [user, reward] = await Promise.all([
    prisma.user.findUnique({ where: { phoneNumber: g.userId }, select: { name: true } }),
    g.rewardId ? prisma.loyaltyEntry.findUnique({ where: { id: g.rewardId } }) : null,
  ]);
  send(res, {
    ...g, name: user?.name ?? null,
    reward: reward ? { id: reward.id, points: Number(reward.points), earnedOn: reward.earnedOn, expiresOn: reward.expiresOn, detail: reward.detail } : null,
  });
}));
