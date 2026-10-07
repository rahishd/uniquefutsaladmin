// Tie-sheet logic shared by the staff Tournament page and the match-day host link: saving the sheet, goals, kick-off and full time,
// and telling the customers who follow a match (bell notice + Web Push). Mirrors the customer backend (tournament.tiesheet.ts, matchFollow.ts).
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "./http";
import { notify } from "./customer-effects";
import { pushToUsers } from "./push";

export type Actor = { id: string; name: string; ip?: string | null };
export type MatchState = { id: string; home: string | null; away: string | null; status: string; homeScore: number | null; awayScore: number | null; note: string | null };

const teams = (m: MatchState) => `${m.home ?? "TBD"} v ${m.away ?? "TBD"}`;
const score = (m: MatchState) => `${m.home ?? "TBD"} ${m.homeScore ?? 0}-${m.awayScore ?? 0} ${m.away ?? "TBD"}`;

// What a follower should be told about a change to one match. Nothing when nothing they care about changed.
export function describeChange(before: MatchState | null, after: MatchState): { title: string; message: string; key: string } | null {
  const was = before?.status ?? "upcoming";
  const key = `mf-${after.id}-${after.status}-${after.homeScore ?? "x"}-${after.awayScore ?? "x"}`;
  if (after.status === "finished" && was !== "finished") return { title: "Full time", message: `${score(after)}${after.note ? ` (${after.note})` : ""}`, key };
  if (after.status === "live" && was !== "live") return { title: "Kick-off: it is live", message: `${teams(after)} has started${after.homeScore !== null ? `. ${score(after)}` : ""}`, key };
  if (after.status === "live" && (before?.homeScore !== after.homeScore || before?.awayScore !== after.awayScore)) return { title: "Goal!", message: score(after), key };
  return null;
}

// Tells everyone following the match. Never throws: a failed notice must not undo a saved score.
export async function notifyFollowers(before: MatchState | null, after: MatchState): Promise<{ followers: number; pushed: number }> {
  try {
    const change = describeChange(before, after);
    if (!change) return { followers: 0, pushed: 0 };
    const follows = await prisma.matchFollow.findMany({ where: { matchId: after.id }, select: { userId: true } });
    for (const f of follows) await notify(prisma, { userId: f.userId, type: "tournament", title: change.title, message: change.message, href: "/tournaments", dedupeKey: `${change.key}-${f.userId}` });
    const pushed = await pushToUsers(follows.map((f) => f.userId), { title: change.title, body: change.message, href: "/tournaments", tag: change.key });
    return { followers: follows.length, pushed: pushed.customers };
  } catch {
    return { followers: 0, pushed: 0 };
  }
}

export async function record(actor: Actor, action: string, tournamentId: string, details: unknown) {
  await prisma.adminAuditLog.create({
    data: { staffId: actor.id, staffName: actor.name, action, entity: "tournament", entityId: tournamentId, details: JSON.stringify(details).slice(0, 4000), ip: actor.ip ?? null },
  });
}

const goalsFirst = Prisma.validator<Prisma.TournamentMatchDefaultArgs>()({ include: { goals: { orderBy: [{ minute: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] } } });

type MatchRow = Prisma.TournamentMatchGetPayload<typeof goalsFirst>;
const shape = (m: MatchRow) => ({
  id: m.id, home: m.home, away: m.away, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, note: m.note, startsAt: m.startsAt, venue: m.venue,
  goals: m.goals.map((g) => ({ id: g.id, side: g.side, minute: g.minute, scorer: g.scorer })),
});

// The tie-sheet as the editor shows it: rounds in order, matches with their goals.
export async function loadSheet(tournamentId: string) {
  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId }, orderBy: { position: "asc" },
    include: { matches: { orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { id: "asc" }], ...goalsFirst } },
  });
  return rounds.map((r) => ({ id: r.id, name: r.name, matches: r.matches.map(shape) }));
}

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
export const structureBody = z.object({
  rounds: z.array(z.object({
    id: z.string().nullish(),
    name: z.string().trim().min(1, "Give every round a name").max(40),
    matches: z.array(z.object({
      id: z.string().nullish(), home: text(40), away: text(40),
      startsAt: z.string().datetime({ offset: true }).nullish().transform((v) => (v ? new Date(v) : null)),
      venue: text(60), note: text(60),
    })).max(64),
  })).max(20),
});

// Saves rounds, team names, times, venues and notes IN PLACE. A match with its id keeps its goals, score, status and followers; a new
// match starts as upcoming. Live state is changed only by goal / kick-off / full time (below), so two people can never overwrite
// each other's score by saving an old copy of the sheet.
export async function saveStructure(tournamentId: string, input: z.infer<typeof structureBody>, actor: Actor) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new AppError(404, "Tournament not found");
  await prisma.$transaction(async (tx) => {
    const old = await tx.tournamentRound.findMany({ where: { tournamentId }, include: { matches: true } });
    const oldRounds = new Map(old.map((r) => [r.id, r]));
    const oldMatches = new Map(old.flatMap((r) => r.matches).map((m) => [m.id, m]));
    const keepMatches = new Set<string>();
    const keepRounds = new Set<string>();
    for (let ri = 0; ri < input.rounds.length; ri++) {
      const r = input.rounds[ri];
      const round = r.id && oldRounds.has(r.id)
        ? await tx.tournamentRound.update({ where: { id: r.id }, data: { name: r.name, position: ri } })
        : await tx.tournamentRound.create({ data: { tournamentId, name: r.name, position: ri } });
      keepRounds.add(round.id);
      for (const m of r.matches) {
        const data = { home: m.home, away: m.away, startsAt: m.startsAt, venue: m.venue, note: m.note };
        if (m.id && oldMatches.has(m.id) && !keepMatches.has(m.id)) {
          await tx.tournamentMatch.update({ where: { id: m.id }, data: { ...data, roundId: round.id } });
          keepMatches.add(m.id);
        } else {
          keepMatches.add((await tx.tournamentMatch.create({ data: { ...data, roundId: round.id } })).id);
        }
      }
    }
    const goneMatches = [...oldMatches.keys()].filter((id) => !keepMatches.has(id));
    if (goneMatches.length) await tx.tournamentMatch.deleteMany({ where: { id: { in: goneMatches } } }); // goals and follows go with them
    const goneRounds = [...oldRounds.keys()].filter((id) => !keepRounds.has(id));
    if (goneRounds.length) await tx.tournamentRound.deleteMany({ where: { id: { in: goneRounds } } });
  });
  await record(actor, "tiesheet-save", tournamentId, { rounds: input.rounds.length, matches: input.rounds.reduce((n, r) => n + r.matches.length, 0) });
}

// Locks the match row so two people adding goals at the same moment cannot lose one.
async function locked(tx: Prisma.TransactionClient, matchId: string) {
  await tx.$queryRaw`SELECT "id" FROM "TournamentMatch" WHERE "id" = ${matchId} FOR UPDATE`;
  const m = await tx.tournamentMatch.findUnique({ where: { id: matchId }, include: { round: { select: { tournamentId: true } } } });
  if (!m) throw new AppError(404, "Match not found");
  return m;
}

const state = (m: MatchState): MatchState => ({ id: m.id, home: m.home, away: m.away, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, note: m.note });

export const goalBody = z.object({ side: z.enum(["home", "away"]), minute: z.number().int().min(0).max(130).nullish(), scorer: text(40) });
export const statusBody = z.object({
  status: z.enum(["upcoming", "live", "finished"]),
  homeScore: z.number().int().min(0).max(99).nullish(), awayScore: z.number().int().min(0).max(99).nullish(), note: text(60).optional(),
});

async function oneMatch(id: string) {
  return shape(await prisma.tournamentMatch.findUniqueOrThrow({ where: { id }, ...goalsFirst }));
}

// `onlyTournament` is set for the host link: it may only touch matches of its own tournament.
export async function addGoal(matchId: string, b: z.infer<typeof goalBody>, actor: Actor, onlyTournament?: string) {
  let before!: MatchState;
  let after!: MatchState;
  let tournamentId = "";
  await prisma.$transaction(async (tx) => {
    const m = await locked(tx, matchId);
    tournamentId = m.round.tournamentId;
    if (onlyTournament && tournamentId !== onlyTournament) throw new AppError(404, "Match not found");
    if (m.status === "finished") throw new AppError(409, "This match has finished. Reopen it to add a goal.");
    if (!m.home || !m.away) throw new AppError(409, "Set both teams before adding goals.");
    before = state(m);
    const home = (m.homeScore ?? 0) + (b.side === "home" ? 1 : 0);
    const away = (m.awayScore ?? 0) + (b.side === "away" ? 1 : 0);
    const updated = await tx.tournamentMatch.update({ where: { id: m.id }, data: { status: "live", homeScore: home, awayScore: away } });
    await tx.matchGoal.create({ data: { matchId: m.id, side: b.side, minute: b.minute ?? null, scorer: b.scorer ?? null, createdBy: actor.name } });
    after = state(updated);
  });
  const told = await notifyFollowers(before, after);
  await record(actor, "goal-add", tournamentId, { match: score(after), side: b.side, minute: b.minute ?? null, scorer: b.scorer ?? null, followers: told.followers });
  return { match: await oneMatch(matchId), ...told };
}

// Takes a goal back (a mistake). The score goes down by one for that side. Followers are not told about corrections.
export async function removeGoal(goalId: string, actor: Actor, onlyTournament?: string) {
  const g = await prisma.matchGoal.findUnique({ where: { id: goalId } });
  if (!g) throw new AppError(404, "Goal not found");
  let tournamentId = "";
  await prisma.$transaction(async (tx) => {
    const m = await locked(tx, g.matchId);
    tournamentId = m.round.tournamentId;
    if (onlyTournament && tournamentId !== onlyTournament) throw new AppError(404, "Goal not found");
    if (!(await tx.matchGoal.findUnique({ where: { id: goalId } }))) return; // already removed by someone else
    await tx.matchGoal.delete({ where: { id: goalId } });
    await tx.tournamentMatch.update({
      where: { id: m.id },
      data: g.side === "home" ? { homeScore: Math.max(0, (m.homeScore ?? 0) - 1) } : { awayScore: Math.max(0, (m.awayScore ?? 0) - 1) },
    });
  });
  await record(actor, "goal-remove", tournamentId, { side: g.side, minute: g.minute, scorer: g.scorer });
  return { match: await oneMatch(g.matchId) };
}

// Kick-off, full time, reopen, and score corrections.
export async function setStatus(matchId: string, b: z.infer<typeof statusBody>, actor: Actor, onlyTournament?: string) {
  let before!: MatchState;
  let after!: MatchState;
  let tournamentId = "";
  await prisma.$transaction(async (tx) => {
    const m = await locked(tx, matchId);
    tournamentId = m.round.tournamentId;
    if (onlyTournament && tournamentId !== onlyTournament) throw new AppError(404, "Match not found");
    if (b.status !== "upcoming" && (!m.home || !m.away)) throw new AppError(409, "Set both teams first.");
    before = state(m);
    const started = b.status !== "upcoming";
    const updated = await tx.tournamentMatch.update({
      where: { id: m.id },
      data: {
        status: b.status,
        homeScore: started ? b.homeScore ?? m.homeScore ?? 0 : null,
        awayScore: started ? b.awayScore ?? m.awayScore ?? 0 : null,
        ...(b.note !== undefined ? { note: b.note } : {}),
      },
    });
    after = state(updated);
  });
  const told = await notifyFollowers(before, after);
  await record(actor, `match-${b.status}`, tournamentId, { match: score(after), note: after.note, followers: told.followers });
  return { match: await oneMatch(matchId), ...told };
}
