import { randomBytes } from "crypto";
import { Router } from "express";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { Actor, addGoal, goalBody, loadSheet, record, removeGoal, saveStructure, setStatus, statusBody, structureBody } from "../lib/tiesheet";

// Tournament page: the list, one tournament's tie-sheet with live scores and goals, and the private link a match-day host uses.
// The host link itself (no staff sign-in) is in tournament-host.ts.
export const tournamentsRouter = Router();

const who = (req: Parameters<Parameters<typeof handler>[0]>[0]): Actor => ({ id: req.staff!.id, name: req.staff!.name, ip: req.ip ?? null });
export const stateOf = (t: { status: string; startDate: string; endDate: string }) => (t.status === "completed" ? "completed" : t.startDate > todayKey() ? "upcoming" : "live");

// When a host link stops working by itself: a few days after the tournament ends (end of that day, Nepal time).
export const linkExpiry = (endDate: string) => new Date(`${addDaysKey(endDate, 3)}T23:59:59+05:45`);
const newToken = () => randomBytes(24).toString("base64url");

const linkView = (l: { token: string; active: boolean; expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date } | null) =>
  l ? { token: l.token, active: l.active, expired: !!l.expiresAt && l.expiresAt < new Date(), expiresAt: l.expiresAt, lastUsedAt: l.lastUsedAt, createdAt: l.createdAt } : null;

tournamentsRouter.get("/", requirePermission("tournaments.view"), handler(async (_req, res) => {
  const rows = await prisma.tournament.findMany({
    orderBy: [{ startDate: "desc" }],
    take: 100,
    include: { _count: { select: { registrations: true } } },
  });
  const rounds = await prisma.tournamentRound.findMany({ where: { tournamentId: { in: rows.map((t) => t.id) } }, select: { tournamentId: true, matches: { select: { status: true } } } });
  const sheet = new Map<string, { matches: number; live: number; finished: number }>();
  for (const r of rounds) {
    const s = sheet.get(r.tournamentId) ?? { matches: 0, live: 0, finished: 0 };
    for (const m of r.matches) { s.matches++; if (m.status === "live") s.live++; if (m.status === "finished") s.finished++; }
    sheet.set(r.tournamentId, s);
  }
  send(res, rows.map((t) => ({
    id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t), prizePool: t.prizePool, minTeams: t.minTeams, maxTeams: t.maxTeams,
    registrations: t._count.registrations, isActive: t.isActive, ...(sheet.get(t.id) ?? { matches: 0, live: 0, finished: 0 }),
  })));
}));

tournamentsRouter.get("/:id", requirePermission("tournaments.view"), handler(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { registrations: true } } } });
  if (!t) throw new AppError(404, "Tournament not found");
  const canShare = !!req.staff!.permissions.includes("tournaments.share");
  const link = canShare ? await prisma.tournamentHostLink.findUnique({ where: { tournamentId: t.id } }) : null;
  send(res, {
    tournament: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t), prizePool: t.prizePool, registrations: t._count.registrations },
    rounds: await loadSheet(t.id),
    hostLink: linkView(link),
    canShare,
  });
}));

tournamentsRouter.put("/:id/tiesheet", requirePermission("tournaments.edit"), handler(async (req, res) => {
  const id = param(req, "id");
  await saveStructure(id, parse(structureBody, req.body), who(req));
  send(res, { rounds: await loadSheet(id) }, "Tie-sheet saved");
}));

tournamentsRouter.post("/matches/:id/goal", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await addGoal(param(req, "id"), parse(goalBody, req.body), who(req)), "Goal added", 201);
}));

tournamentsRouter.delete("/goals/:id", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await removeGoal(param(req, "id"), who(req)), "Goal removed");
}));

tournamentsRouter.post("/matches/:id/status", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await setStatus(param(req, "id"), parse(statusBody, req.body), who(req)), "Match updated");
}));

// Create the link, or make a new one (the old one stops working at once).
tournamentsRouter.post("/:id/host-link", requirePermission("tournaments.share"), handler(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") } });
  if (!t) throw new AppError(404, "Tournament not found");
  const data = { token: newToken(), active: true, expiresAt: linkExpiry(t.endDate), createdBy: req.staff!.name, lastUsedAt: null };
  const link = await prisma.tournamentHostLink.upsert({ where: { tournamentId: t.id }, create: { tournamentId: t.id, ...data }, update: data });
  await record(who(req), "host-link-create", t.id, { expiresAt: link.expiresAt });
  send(res, linkView(link), "Host link ready", 201);
}));

tournamentsRouter.delete("/:id/host-link", requirePermission("tournaments.share"), handler(async (req, res) => {
  const id = param(req, "id");
  await prisma.tournamentHostLink.updateMany({ where: { tournamentId: id }, data: { active: false } });
  await record(who(req), "host-link-revoke", id, {});
  send(res, null, "Host link switched off");
}));
