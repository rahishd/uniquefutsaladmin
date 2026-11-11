// Tournament Organizer app. A staff-made account with role "organizer" signs in with its Unique Futsal ID (email) and password and gets ONLY
// this: the hosted tournaments given to it. For each one: the details, the tie-sheet (build it, score matches), the registered teams and
// the bill (read only). It has no portal permissions at all, so every other admin route refuses it.
import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, param, parse, send } from "../lib/http";
import { Actor, addGoal, goalBody, loadSheet, removeGoal, saveStructure, setStatus, statusBody, structureBody } from "../lib/tiesheet";
import { bill } from "./tournament-events";
import { stateOf } from "./tournaments";

export const organizerRouter = Router();

organizerRouter.use((req, _res, next) => (req.staff?.role === "organizer" ? next() : next(new AppError(403, "This area is for Tournament Organizer accounts."))));

const actor = (req: Request): Actor => ({ id: `organizer:${req.staff!.id}`, name: `${req.staff!.name} (organizer)`, ip: req.ip ?? null });

// the tournament in the address, only if it was given to this account
async function mine(req: Request) {
  const id = param(req, "id");
  const link = await prisma.tournamentOrganizer.findUnique({ where: { staffId_tournamentId: { staffId: req.staff!.id, tournamentId: id } } });
  if (!link) throw new AppError(403, "This tournament is not assigned to you.");
  const t = await prisma.tournament.findUnique({ where: { id }, include: { days: { orderBy: { date: "asc" } }, _count: { select: { registrations: true } } } });
  if (!t) throw new AppError(404, "Tournament not found");
  return t;
}

// The prizes: a place (1st, 2nd, ...), the cash prize, the trophy or gift, and a note
const prizesBody = z.object({
  prizes: z.array(z.object({
    place: z.string().trim().min(1, "Write the place, for example 1st").max(20),
    cash: z.number().int("Whole rupees only").min(0).max(100_000_000).default(0),
    trophy: z.string().trim().max(80).default(""),
    note: z.string().trim().max(200).default(""),
  })).max(12, "At most 12 prizes"),
});
type Prize = { place: string; cash: number; trophy: string; note: string };
const prizesOf = (raw: unknown): Prize[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => (p && typeof p === "object" ? [{ place: String((p as Prize).place ?? ""), cash: Number((p as Prize).cash) || 0, trophy: String((p as Prize).trophy ?? ""), note: String((p as Prize).note ?? "") }] : []));
};

const summary = (t: { id: string; name: string; startDate: string; endDate: string; hostName: string | null; description: string | null; prizePool: number; prizes: unknown; rules: string | null; maxTeams: number; days: { date: string; startHour: number; endHour: number }[] } & Parameters<typeof stateOf>[0]) => ({
  id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t), hostName: t.hostName, description: t.description, prizePool: t.prizePool, prizes: prizesOf(t.prizes), rules: t.rules ?? "", maxTeams: t.maxTeams,
  days: t.days.map((d) => ({ date: d.date, startHour: d.startHour, endHour: d.endHour })),
});

// who I am and which tournaments I may open
organizerRouter.get("/me", handler(async (req, res) => {
  const me = await prisma.staffUser.findUniqueOrThrow({ where: { id: req.staff!.id }, select: { id: true, name: true, email: true, avatar: true } });
  // An account whose ID is a mobile number (the host's own customer login): every hosted tournament registered with that number
  // belongs to it, also the ones registered after it first signed in. They are linked here, each time the app opens.
  if (/^\d{10}$/.test(me.email)) {
    const hosted = await prisma.tournament.findMany({ where: { hostedEvent: true, status: { not: "cancelled" }, hostPhone: { not: null } }, select: { id: true, hostPhone: true } });
    const mineIds = hosted.filter((t) => (t.hostPhone ?? "").replace(/\D/g, "").slice(-10) === me.email).map((t) => t.id);
    if (mineIds.length) await prisma.tournamentOrganizer.createMany({ data: mineIds.map((tournamentId) => ({ staffId: me.id, tournamentId })), skipDuplicates: true });
  }
  const links = await prisma.tournamentOrganizer.findMany({ where: { staffId: req.staff!.id }, select: { tournamentId: true } });
  const list = await prisma.tournament.findMany({ where: { id: { in: links.map((l) => l.tournamentId) } }, include: { days: { orderBy: { date: "asc" } } }, orderBy: { startDate: "asc" } });
  send(res, { ...me, tournaments: list.map(summary) });
}));

organizerRouter.get("/tournaments/:id", handler(async (req, res) => {
  const t = await mine(req);
  send(res, { ...summary(t), teams: t._count.registrations, hostedEvent: t.hostedEvent });
}));

// ---- prizes: the organizer writes them (the total prize pool is the cash prizes added up) ----
organizerRouter.put("/tournaments/:id/prizes", handler(async (req, res) => {
  const t = await mine(req);
  const { prizes } = parse(prizesBody, req.body);
  const total = prizes.reduce((n, p) => n + p.cash, 0);
  await prisma.tournament.update({ where: { id: t.id }, data: { prizes, prizePool: total } });
  await audit(req, "prizes", "tournament", t.id, { places: prizes.map((p) => p.place), total });
  send(res, { prizes, prizePool: total }, "Prizes saved");
}));

// ---- rules and regulations: free text the organizer writes for their own tournament ----
organizerRouter.put("/tournaments/:id/rules", handler(async (req, res) => {
  const t = await mine(req);
  const { rules } = parse(z.object({ rules: z.string().trim().max(10_000, "The rules are too long (10,000 characters at most)") }), req.body);
  await prisma.tournament.update({ where: { id: t.id }, data: { rules: rules || null } });
  await audit(req, "rules", "tournament", t.id, { length: rules.length });
  send(res, { rules }, "Rules saved");
}));

// ---- the most teams the tournament takes: the organizer decides (never below the teams already approved or waiting) ----
organizerRouter.put("/tournaments/:id/max-teams", handler(async (req, res) => {
  const t = await mine(req);
  const { maxTeams } = parse(z.object({ maxTeams: z.number().int("Whole number of teams").min(2, "At least 2 teams").max(64, "At most 64 teams") }), req.body);
  const held = await prisma.registration.count({ where: { tournamentId: t.id, status: { in: ["approved", "pending"] } } });
  if (maxTeams < held) throw new AppError(409, `${held} teams are already in or waiting. Remove a team first, or choose ${held} or more.`);
  await prisma.tournament.update({ where: { id: t.id }, data: { maxTeams } });
  await audit(req, "max-teams", "tournament", t.id, { from: t.maxTeams, to: maxTeams });
  send(res, { maxTeams }, "Team limit saved");
}));

// ---- live link: the Facebook Live address of a match (only Facebook links are accepted) ----
const FACEBOOK_HOSTS = ["facebook.com", "fb.watch", "fb.com", "fb.gg"];
const liveLink = z.string().trim().max(500).url("Paste the full link, starting with https://").refine((v) => {
  try { const u = new URL(v); return u.protocol === "https:" && FACEBOOK_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h)); } catch { return false; }
}, "This is not a Facebook link. Paste the link of your Facebook live video.");
organizerRouter.put("/tournaments/:id/matches/:mid/live-link", handler(async (req, res) => {
  const t = await mine(req);
  const { url } = parse(z.object({ url: liveLink.nullable() }), req.body);
  const m = await prisma.tournamentMatch.findFirst({ where: { id: param(req, "mid"), round: { tournamentId: t.id } }, select: { id: true } });
  if (!m) throw new AppError(404, "Match not found");
  await prisma.tournamentMatch.update({ where: { id: m.id }, data: { liveUrl: url } });
  await audit(req, url ? "live-link-set" : "live-link-clear", "tournament", t.id, { match: m.id });
  send(res, { liveUrl: url }, url ? "Live link saved" : "Live link removed");
}));

// ---- tie-sheet ----
organizerRouter.get("/tournaments/:id/sheet", handler(async (req, res) => {
  const t = await mine(req);
  send(res, { rounds: await loadSheet(t.id) });
}));
organizerRouter.put("/tournaments/:id/sheet", handler(async (req, res) => {
  const t = await mine(req);
  await saveStructure(t.id, parse(structureBody, req.body), actor(req));
  send(res, { rounds: await loadSheet(t.id) }, "Tie-sheet saved");
}));
organizerRouter.post("/tournaments/:id/matches/:mid/goal", handler(async (req, res) => {
  const t = await mine(req);
  send(res, await addGoal(param(req, "mid"), parse(goalBody, req.body), actor(req), t.id), "Goal added", 201);
}));
organizerRouter.delete("/tournaments/:id/goals/:gid", handler(async (req, res) => {
  const t = await mine(req);
  send(res, await removeGoal(param(req, "gid"), actor(req), t.id), "Goal removed");
}));
organizerRouter.post("/tournaments/:id/matches/:mid/status", handler(async (req, res) => {
  const t = await mine(req);
  send(res, await setStatus(param(req, "mid"), parse(statusBody, req.body), actor(req), t.id), "Match updated");
}));

// ---- teams: the teams registered for this tournament (names are what the tie-sheet suggests) ----
const playersOf = (raw: string): string[] => {
  try { const j = JSON.parse(raw) as unknown; if (Array.isArray(j)) return j.map(String).filter(Boolean); } catch { /* plain text */ }
  return raw.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
};
organizerRouter.get("/tournaments/:id/teams", handler(async (req, res) => {
  const t = await mine(req);
  const rows = await prisma.registration.findMany({ where: { tournamentId: t.id }, orderBy: { createdAt: "asc" } });
  send(res, {
    maxTeams: t.maxTeams,
    items: rows.map((r) => ({ id: r.id, teamName: r.teamName, captainName: r.captainName, phone: r.contactPhone, status: r.status, players: playersOf(r.players) })),
  });
}));

// The host keeps the team list: add a team (approved at once), edit one, approve or decline a new registration, remove one.
const teamBody = z.object({
  teamName: z.string().trim().min(2, "Enter the team name").max(40),
  captainName: z.string().trim().min(2, "Enter the captain's name").max(40),
  phone: z.string().trim().regex(/^\+?\d[\d\s-]{6,16}$/, "Enter the captain's phone number, digits only"),
  players: z.array(z.string().trim().min(1).max(40)).max(25, "At most 25 players").default([]),
});
const taken = (teamName: string) => teamName.trim().toLowerCase();

// a tournament holds at most maxTeams teams that are approved or still waiting
async function room(tournamentId: string, maxTeams: number, exceptId?: string) {
  const n = await prisma.registration.count({ where: { tournamentId, status: { in: ["approved", "pending"] }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (n >= maxTeams) throw new AppError(409, `The tournament is full: at most ${maxTeams} teams.`);
}
async function noTwin(tournamentId: string, teamName: string, exceptId?: string) {
  const rows = await prisma.registration.findMany({ where: { tournamentId, status: { not: "rejected" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { teamName: true } });
  if (rows.some((r) => taken(r.teamName) === taken(teamName))) throw new AppError(409, "A team with this name is already in the tournament.");
}
const teamView = (r: { id: string; teamName: string; captainName: string; contactPhone: string; status: string; players: string }) => ({ id: r.id, teamName: r.teamName, captainName: r.captainName, phone: r.contactPhone, status: r.status, players: playersOf(r.players) });

organizerRouter.post("/tournaments/:id/teams", handler(async (req, res) => {
  const t = await mine(req);
  const b = parse(teamBody, req.body);
  await room(t.id, t.maxTeams);
  await noTwin(t.id, b.teamName);
  const r = await prisma.registration.create({ data: { tournamentId: t.id, teamName: b.teamName, captainName: b.captainName, contactPhone: b.phone, contactEmail: "", players: JSON.stringify(b.players), status: "approved" } });
  await audit(req, "team-add", "tournament", t.id, { team: b.teamName });
  send(res, teamView(r), "Team added", 201);
}));

organizerRouter.patch("/tournaments/:id/teams/:rid", handler(async (req, res) => {
  const t = await mine(req);
  const b = parse(teamBody.partial().extend({ status: z.enum(["approved", "pending", "rejected"]).optional() }), req.body);
  const cur = await prisma.registration.findFirst({ where: { id: param(req, "rid"), tournamentId: t.id } });
  if (!cur) throw new AppError(404, "Team not found");
  if (b.teamName && taken(b.teamName) !== taken(cur.teamName)) await noTwin(t.id, b.teamName, cur.id);
  if (b.status && b.status !== "rejected" && cur.status === "rejected") await room(t.id, t.maxTeams, cur.id);
  const r = await prisma.registration.update({
    where: { id: cur.id },
    data: { ...(b.teamName ? { teamName: b.teamName } : {}), ...(b.captainName ? { captainName: b.captainName } : {}), ...(b.phone ? { contactPhone: b.phone } : {}), ...(b.players ? { players: JSON.stringify(b.players) } : {}), ...(b.status ? { status: b.status } : {}) },
  });
  await audit(req, "team-edit", "tournament", t.id, { team: r.teamName, status: r.status });
  send(res, teamView(r), "Team saved");
}));

organizerRouter.delete("/tournaments/:id/teams/:rid", handler(async (req, res) => {
  const t = await mine(req);
  const cur = await prisma.registration.findFirst({ where: { id: param(req, "rid"), tournamentId: t.id } });
  if (!cur) throw new AppError(404, "Team not found");
  await prisma.registration.delete({ where: { id: cur.id } });
  await audit(req, "team-delete", "tournament", t.id, { team: cur.teamName });
  send(res, null, "Team removed");
}));

// ---- billing: read only. Only the venue's staff add goods, take payments or close the bill. ----
organizerRouter.get("/tournaments/:id/billing", handler(async (req, res) => {
  const t = await mine(req);
  if (!t.hostedEvent) return send(res, null, "No bill for this tournament");
  send(res, await bill(t.id));
}));
