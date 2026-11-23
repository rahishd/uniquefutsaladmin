// Unique Ludo (the online board game in the customer app): what staff see. Everything here is read from the saved games,
// the dice log and the loyalty ledger; nothing is edited. Results are decided by the customer server. A reward that has to be
// corrected is corrected in Loyalty Points > Adjust, which records the staff member, the reason and the time.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const ludoRouter = Router();

const filters = z.object({
  status: z.enum(["lobby", "active", "completed", "abandoned", "cancelled"]).optional(),
  mode: z.enum(["solo", "multi"]).optional(),
  q: z.string().trim().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const STARTED = ["active", "completed", "abandoned", "cancelled"];

// games that really started (an opened and closed lobby is not a game), plus the points they moved
async function totals(day: Prisma.StringFilter | undefined) {
  const where: Prisma.LudoGameWhereInput = { startedAt: { not: null }, ...(day ? { day } : {}) };
  const entryDay = day ? { earnedOn: day } : {};
  const [games, solo, multi, completed, abandoned, cancelled, players, fees, wins, refunds] = await Promise.all([
    prisma.ludoGame.count({ where }),
    prisma.ludoGame.count({ where: { ...where, mode: "solo" } }),
    prisma.ludoGame.count({ where: { ...where, mode: "multi" } }),
    prisma.ludoGame.count({ where: { ...where, status: "completed" } }),
    prisma.ludoGame.count({ where: { ...where, status: "abandoned" } }),
    prisma.ludoGame.count({ where: { ...where, status: "cancelled" } }),
    prisma.ludoPlayer.groupBy({ by: ["userId"], where: { userId: { not: null }, game: where } }),
    prisma.loyaltyEntry.aggregate({ where: { kind: "ludo", sourceType: "ludo_fee", ...entryDay }, _sum: { points: true }, _count: { _all: true } }),
    prisma.loyaltyEntry.aggregate({ where: { kind: "ludo", sourceType: "ludo_win", ...entryDay }, _sum: { points: true }, _count: { _all: true } }),
    prisma.loyaltyEntry.aggregate({ where: { kind: "ludo", sourceType: "ludo_refund", ...entryDay }, _sum: { points: true } }),
  ]);
  return {
    games, solo, multi, completed, abandoned, cancelled, players: players.length,
    pointsCollected: Math.abs(Number(fees._sum.points ?? 0)), pointsGiven: Number(wins._sum.points ?? 0), pointsRefunded: Number(refunds._sum.points ?? 0),
    rewards: wins._count._all,
  };
}

ludoRouter.get("/", requirePermission("ludo.view"), handler(async (req, res) => {
  const f = parse(filters, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  let userIds: string[] | undefined;
  if (f.q) {
    const users = await prisma.user.findMany({ where: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { phoneNumber: { contains: f.q } }] }, select: { phoneNumber: true }, take: 200 });
    userIds = users.map((u) => u.phoneNumber);
  }
  const where: Prisma.LudoGameWhereInput = {
    ...(f.status ? { status: f.status } : { status: { in: STARTED } }),
    ...(f.status === "lobby" ? {} : { startedAt: { not: null } }),
    ...(f.mode ? { mode: f.mode } : {}),
    ...(userIds ? { players: { some: { userId: { in: userIds } } } } : {}),
    ...(f.from || f.to ? { day: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };

  const since14 = addDaysKey(today, -13);
  const since7 = addDaysKey(today, -6);
  const [all, todayT, monthT, byDayRows, rows, total, week] = await Promise.all([
    totals(undefined),
    totals({ equals: today }),
    totals({ gte: monthStart }),
    prisma.ludoGame.groupBy({ by: ["day", "mode"], where: { day: { gte: since14 } }, _count: { _all: true } }),
    prisma.ludoGame.findMany({ where, orderBy: { createdAt: "desc" }, take, skip, include: { players: { orderBy: { seat: "asc" } } } }),
    prisma.ludoGame.count({ where }),
    prisma.ludoPlayer.findMany({
      where: { userId: { not: null }, feeEntryId: { not: null }, game: { day: { gte: since7 } } },
      select: { userId: true, result: true, gameId: true, game: { select: { mode: true, status: true } } },
    }),
  ]);

  // the last 14 days, one row per day (days without games included)
  const byDay = Array.from({ length: 14 }, (_, i) => {
    const d = addDaysKey(since14, i);
    const mine = byDayRows.filter((r) => r.day === d);
    const solo = mine.find((r) => r.mode === "solo")?._count._all ?? 0;
    const multi = mine.find((r) => r.mode === "multi")?._count._all ?? 0;
    return { day: d, games: solo + multi, solo, multi };
  });

  // things worth a look (the last 7 days): lots of wins, lots of unfinished games, the same pair playing each other again and again
  type Flag = { phone: string; reasons: string[]; games: number };
  const per = new Map<string, { games: number; wins: number; left: number }>();
  const byGame = new Map<string, string[]>();
  for (const p of week) {
    const u = p.userId as string;
    const s = per.get(u) ?? { games: 0, wins: 0, left: 0 };
    s.games++;
    if (p.result === "won") s.wins++;
    if (p.result === "left" || p.game.status === "abandoned") s.left++;
    per.set(u, s);
    if (p.game.mode === "multi") byGame.set(p.gameId, [...(byGame.get(p.gameId) ?? []), u]);
  }
  const pairs = new Map<string, number>();
  for (const humans of byGame.values()) {
    const sorted = [...new Set(humans)].sort();
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) pairs.set(`${sorted[i]}|${sorted[j]}`, (pairs.get(`${sorted[i]}|${sorted[j]}`) ?? 0) + 1);
  }
  const flags: Flag[] = [];
  for (const [phone, s] of per) {
    const reasons: string[] = [];
    if (s.wins >= 8) reasons.push(`${s.wins} wins`);
    if (s.left >= 6) reasons.push(`${s.left} games left unfinished`);
    for (const [pair, n] of pairs) if (n >= 5 && pair.split("|").includes(phone)) reasons.push(`${n} games against ${pair.split("|").find((x) => x !== phone)} (check for points passing)`);
    if (reasons.length) flags.push({ phone, reasons, games: s.games });
  }

  const phones = [...new Set([...rows.flatMap((r) => r.players.map((p) => p.userId).filter(Boolean) as string[]), ...flags.map((x) => x.phone)])];
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));

  send(res, {
    totals: { all, today: todayT, month: monthT },
    byDay,
    flags: flags.map((x) => ({ ...x, name: name.get(x.phone) ?? null })),
    total, page: pageNo, limit,
    items: rows.map((g) => ({
      id: g.id, code: g.code, mode: g.mode, status: g.status, difficulty: g.difficulty, day: g.day, startedAt: g.startedAt, finishedAt: g.finishedAt, cancelReason: g.cancelReason,
      seconds: g.startedAt && g.finishedAt ? Math.round((g.finishedAt.getTime() - g.startedAt.getTime()) / 1000) : null,
      players: g.players.map((p) => ({ seat: p.seat, phone: p.userId, name: p.isBot ? `${p.name}` : (p.userId ? name.get(p.userId) ?? p.name : p.name), isBot: p.isBot, result: p.result, won: g.winnerSeat === p.seat })),
    })),
  });
}));

// One game with its players, points and the dice log (for checking a complaint or a flagged player)
ludoRouter.get("/:id", requirePermission("ludo.view"), handler(async (req, res) => {
  const g = await prisma.ludoGame.findUnique({ where: { id: String(req.params.id) }, include: { players: { orderBy: { seat: "asc" } }, events: { orderBy: { seq: "asc" }, take: 600 } } });
  if (!g) throw new AppError(404, "Game not found");
  const ids = g.players.flatMap((p) => [p.feeEntryId, p.rewardEntryId, p.refundEntryId]).filter(Boolean) as string[];
  const [entries, users] = await Promise.all([
    prisma.loyaltyEntry.findMany({ where: { id: { in: ids } } }),
    prisma.user.findMany({ where: { phoneNumber: { in: g.players.map((p) => p.userId).filter(Boolean) as string[] } }, select: { phoneNumber: true, name: true } }),
  ]);
  const e = new Map(entries.map((x) => [x.id, x]));
  const nm = new Map(users.map((u) => [u.phoneNumber, u.name]));
  const pts = (id: string | null) => (id && e.get(id) ? { id, points: Number(e.get(id)!.points), earnedOn: e.get(id)!.earnedOn } : null);
  send(res, {
    id: g.id, code: g.code, mode: g.mode, status: g.status, difficulty: g.difficulty, day: g.day, hostId: g.hostId, winnerSeat: g.winnerSeat,
    createdAt: g.createdAt, startedAt: g.startedAt, finishedAt: g.finishedAt, cancelReason: g.cancelReason,
    players: g.players.map((p) => ({
      seat: p.seat, phone: p.userId, name: p.userId ? nm.get(p.userId) ?? p.name : p.name, isBot: p.isBot, botControl: p.botControl, status: p.status, result: p.result, rank: p.rank, captures: p.captures,
      fee: pts(p.feeEntryId), reward: pts(p.rewardEntryId), refund: pts(p.refundEntryId),
    })),
    events: g.events.map((x) => ({ seq: x.seq, seat: x.seat, kind: x.kind, value: x.value, token: x.token, detail: x.detail, at: x.createdAt })),
  });
}));
