import { Router, Request } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db";
import { AppError, handler, param, parse, send } from "../lib/http";
import { Actor, addGoal, goalBody, loadSheet, removeGoal, saveStructure, setStatus, statusBody, structureBody } from "../lib/tiesheet";
import { stateOf } from "./tournaments";

// The match-day host link. NO staff sign-in: the long random token in the link is the key, and it opens ONE tournament only. The host
// sees the tie-sheet and every goal, can add goals, kick off, finish, correct scores and change the sheet. Never shown here: registrations,
// phone numbers, money. Staff create, renew or switch off the link on the Tournament page.
export const tournamentHostRouter = Router();

tournamentHostRouter.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Wait a moment." } }));

async function linkOr404(req: Request) {
  const link = await prisma.tournamentHostLink.findUnique({ where: { token: param(req, "token") } });
  if (!link || !link.active) throw new AppError(404, "This link is not valid. Ask the venue for a new one.");
  if (link.expiresAt && link.expiresAt < new Date()) throw new AppError(410, "This link has expired. Ask the venue for a new one.");
  if (!link.lastUsedAt || Date.now() - link.lastUsedAt.getTime() > 60_000) await prisma.tournamentHostLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
  return link;
}
const host = (req: Request, linkId: string): Actor => ({ id: `host:${linkId}`, name: "Host link", ip: req.ip ?? null });

tournamentHostRouter.get("/:token", handler(async (req, res) => {
  const link = await linkOr404(req);
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: link.tournamentId } });
  send(res, { tournament: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t) }, rounds: await loadSheet(t.id), expiresAt: link.expiresAt });
}));

tournamentHostRouter.put("/:token/tiesheet", handler(async (req, res) => {
  const link = await linkOr404(req);
  await saveStructure(link.tournamentId, parse(structureBody, req.body), host(req, link.id));
  send(res, { rounds: await loadSheet(link.tournamentId) }, "Tie-sheet saved");
}));

tournamentHostRouter.post("/:token/matches/:id/goal", handler(async (req, res) => {
  const link = await linkOr404(req);
  send(res, await addGoal(param(req, "id"), parse(goalBody, req.body), host(req, link.id), link.tournamentId), "Goal added", 201);
}));

tournamentHostRouter.delete("/:token/goals/:id", handler(async (req, res) => {
  const link = await linkOr404(req);
  send(res, await removeGoal(param(req, "id"), host(req, link.id), link.tournamentId), "Goal removed");
}));

tournamentHostRouter.post("/:token/matches/:id/status", handler(async (req, res) => {
  const link = await linkOr404(req);
  send(res, await setStatus(param(req, "id"), parse(statusBody, req.body), host(req, link.id), link.tournamentId), "Match updated");
}));
