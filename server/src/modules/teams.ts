import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const teamsRouter = Router();

// Win / draw / loss and goals from APPROVED results only (the same rule as the customer app's ranking).
type Rec = { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; form: ("W" | "D" | "L")[] };
async function records(teamIds?: string[]): Promise<Map<string, Rec>> {
  const rows = await prisma.challengeResult.findMany({ where: { status: "approved" }, include: { challenge: true }, orderBy: { createdAt: "asc" } });
  const out = new Map<string, Rec>();
  const get = (id: string) => out.get(id) ?? out.set(id, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: [] }).get(id)!;
  for (const r of rows) {
    const other = r.submittedByTeamId === r.challenge.challengerTeamId ? r.challenge.challengedTeamId : r.challenge.challengerTeamId;
    for (const [team, gf, ga] of [[r.submittedByTeamId, r.scoreSubmitter, r.scoreOther], [other, r.scoreOther, r.scoreSubmitter]] as const) {
      if (teamIds && !teamIds.includes(team)) continue;
      const x = get(team);
      const res = gf > ga ? "W" : gf === ga ? "D" : "L";
      x.played++; x.goalsFor += gf; x.goalsAgainst += ga;
      if (res === "W") x.wins++; else if (res === "D") x.draws++; else x.losses++;
      x.form = [...x.form, res as "W" | "D" | "L"].slice(-5);
    }
  }
  return out;
}
const blank: Rec = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: [] };

teamsRouter.get("/", requirePermission("teams.view"), handler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const teams = await prisma.team.findMany({ include: { members: true }, orderBy: { createdAt: "desc" } });
  const captains = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: teams.map((t) => t.captainId) } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const rec = await records();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
  // open = waiting for an answer, or accepted and not played yet
  const open = await prisma.challenge.findMany({ where: { OR: [{ status: "pending" }, { status: "accepted", date: { gte: todayKey } }] }, select: { challengerTeamId: true, challengedTeamId: true } });
  const items = teams
    .map((t) => ({
      id: t.id, name: t.name, area: t.area, captainId: t.captainId, captain: { phone: t.captainId, name: captains.get(t.captainId) ?? null }, members: new Set([t.captainId, ...t.members.map((m) => m.userId)]).size, createdAt: t.createdAt, // the captain always counts, even if the roster row is missing
      record: rec.get(t.id) ?? blank, openChallenges: open.filter((c) => c.challengerTeamId === t.id || c.challengedTeamId === t.id).length,
    }))
    .filter((t) => !q || [t.name, t.area, t.captain.name ?? "", t.captain.phone].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  send(res, items);
}));

// Numbers for the top of the page
teamsRouter.get("/overview", requirePermission("teams.view"), handler(async (_req, res) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
  const [teams, pending, accepted, awaiting, disputed, unpaid] = await Promise.all([
    prisma.team.count(), prisma.challenge.count({ where: { status: "pending" } }), prisma.challenge.count({ where: { status: "accepted", date: { gte: today } } }),
    prisma.challengeResult.count({ where: { status: "awaiting_approval" } }), prisma.challengeResult.count({ where: { status: "disputed" } }),
    prisma.challenge.findMany({ where: { status: "accepted", venuePaidAt: null, date: { lte: today } }, select: { courtPrice: true } }),
  ]);
  send(res, { teams, pendingChallenges: pending, upcomingGames: accepted, resultsAwaitingApproval: awaiting, disputes: disputed, unpaidGames: unpaid.length, unpaidAmount: unpaid.reduce((t, c) => t + c.courtPrice, 0) });
}));

// Every challenge with both team names, the court booking, the money rule and the result
const CH_STATUS = ["pending", "accepted", "declined", "cancelled", "expired"] as const;
teamsRouter.get("/challenges", requirePermission("teams.view"), handler(async (req, res) => {
  const status = CH_STATUS.find((x) => x === req.query.status);
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const all = await prisma.challenge.findMany({ where: status ? { status } : {}, orderBy: [{ date: "desc" }, { startHour: "desc" }], take: 500, include: { results: true } });
  const ids = [...new Set(all.flatMap((c) => [c.challengerTeamId, c.challengedTeamId]))];
  const names = new Map((await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const bookings = new Map((await prisma.booking.findMany({ where: { id: { in: all.flatMap((c) => (c.bookingId ? [c.bookingId] : [])) } }, select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const rows = all.map((c) => {
    const r = c.results[0];
    return {
      id: c.id, type: c.type, status: c.status, date: c.date, startHour: c.startHour, courtPrice: c.courtPrice, loserPct: c.loserPct, message: c.message,
      challenger: names.get(c.challengerTeamId) ?? "Team", challenged: names.get(c.challengedTeamId) ?? "Team", bookingCode: c.bookingId ? bookings.get(c.bookingId) ?? null : null,
      venuePaidAt: c.venuePaidAt, createdAt: c.createdAt,
      result: r ? { status: r.status, submittedBy: names.get(r.submittedByTeamId) ?? "Team", scoreSubmitter: r.scoreSubmitter, scoreOther: r.scoreOther } : null,
    };
  }).filter((c) => !q || [c.challenger, c.challenged, c.bookingCode ?? ""].some((x) => x.toLowerCase().includes(q)));
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  send(res, { items: rows.slice(skip, skip + take), total: rows.length, page: pageNo, limit });
}));

teamsRouter.get("/disputes", requirePermission("teams.view"), handler(async (_req, res) => {
  const results = await prisma.challengeResult.findMany({ where: { status: "disputed" }, include: { challenge: true }, orderBy: { createdAt: "asc" } });
  const ids = [...new Set(results.flatMap((r) => [r.challenge.challengerTeamId, r.challenge.challengedTeamId]))];
  const names = new Map((await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  send(res, results.map((r) => {
    const other = r.submittedByTeamId === r.challenge.challengerTeamId ? r.challenge.challengedTeamId : r.challenge.challengerTeamId;
    return { id: r.id, challengeId: r.challengeId, date: r.challenge.date, startHour: r.challenge.startHour, submittedBy: names.get(r.submittedByTeamId), otherTeam: names.get(other), scoreSubmitter: r.scoreSubmitter, scoreOther: r.scoreOther, createdAt: r.createdAt };
  }));
}));

// Approve a disputed score (optionally corrected) or void it. Same rules as the customer backend: the submitting team is the
// winner or a draw; only an approved result changes records; the winning captain gets 5 points once.
teamsRouter.post("/results/:id/resolve", requirePermission("teams.resolve"), handler(async (req, res) => {
  const b = parse(z.object({
    action: z.enum(["approve", "void"]),
    scoreSubmitter: z.number().int().min(0).max(50).optional(), scoreOther: z.number().int().min(0).max(50).optional(),
    note: z.string().max(300).optional(),
  }), req.body);
  const id = param(req, "id");
  const r = await prisma.challengeResult.findUnique({ where: { id }, include: { challenge: true } });
  if (!r) throw new AppError(404, "Result not found");
  if (r.status !== "disputed") throw new AppError(409, "Only disputed results need staff review");
  if (b.action === "void") {
    await prisma.challengeResult.delete({ where: { id } });
    await audit(req, "void", "result", id, { note: b.note });
    return send(res, null, "Result voided; the winner can upload again");
  }
  let { scoreSubmitter, scoreOther } = r;
  if (b.scoreSubmitter !== undefined || b.scoreOther !== undefined) {
    if (b.scoreSubmitter === undefined || b.scoreOther === undefined) throw new AppError(400, "Send both scores");
    if (b.scoreSubmitter < b.scoreOther) throw new AppError(400, "The submitting team must be the winner or a draw. Void it and ask the winner to upload.");
    scoreSubmitter = b.scoreSubmitter;
    scoreOther = b.scoreOther;
  }
  const upd = await prisma.challengeResult.updateMany({ where: { id, status: "disputed" }, data: { status: "approved", approvedBy: `staff:${req.staff!.id}`, resolutionNote: b.note ?? null, scoreSubmitter, scoreOther } });
  if (upd.count === 0) throw new AppError(409, "This result was just updated by someone else");
  if (scoreSubmitter !== scoreOther) {
    const winner = await prisma.team.findUnique({ where: { id: r.submittedByTeamId } });
    if (winner) await awardPoints({ userId: winner.captainId, kind: "captain_win", points: 5, sourceType: "challenge", sourceId: r.challengeId, detail: "Challenge win" });
  }
  for (const teamId of [r.challenge.challengerTeamId, r.challenge.challengedTeamId]) {
    const t = await prisma.team.findUnique({ where: { id: teamId } });
    if (t) await notify(prisma, { userId: t.captainId, type: "match", title: "Result approved", message: "The result is confirmed. Team records and ratings are updated.", href: "/opponent", dedupeKey: `result-approved-${id}-${t.captainId}` });
  }
  await audit(req, "approve", "result", id, { scoreSubmitter, scoreOther, note: b.note });
  send(res, null, "Result approved");
}));

// Who owes what at the venue for accepted challenge games. A draw is split 50/50; otherwise the loser pays loserPct.
teamsRouter.get("/settlements", requirePermission("teams.view"), handler(async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const list = await prisma.challenge.findMany({ where: { status: "accepted", ...(date ? { date } : {}) }, orderBy: [{ date: "desc" }, { startHour: "asc" }], take: 300 });
  const teams = await prisma.team.findMany({ where: { id: { in: [...new Set(list.flatMap((c) => [c.challengerTeamId, c.challengedTeamId]))] } } });
  const name = new Map(teams.map((t) => [t.id, t.name]));
  const results = await prisma.challengeResult.findMany({ where: { challengeId: { in: list.map((c) => c.id) }, status: "approved" } });
  send(res, list.map((c) => {
    const r = results.find((x) => x.challengeId === c.id);
    let split: null | { challenger: number; challenged: number; basis: string } = null;
    if (r) {
      const winnerIsChallenger = r.submittedByTeamId === c.challengerTeamId;
      if (r.scoreSubmitter === r.scoreOther) {
        const half = Math.round(c.courtPrice / 2);
        split = { challenger: half, challenged: c.courtPrice - half, basis: "draw, split 50/50" };
      } else {
        const loser = Math.round((c.courtPrice * c.loserPct) / 100);
        const winner = c.courtPrice - loser;
        split = { challenger: winnerIsChallenger ? winner : loser, challenged: winnerIsChallenger ? loser : winner, basis: `loser pays ${c.loserPct}%` };
      }
    }
    return { id: c.id, date: c.date, startHour: c.startHour, courtPrice: c.courtPrice, challenger: name.get(c.challengerTeamId), challenged: name.get(c.challengedTeamId), loserPct: c.loserPct, resultApproved: !!r, split, paidAt: c.venuePaidAt };
  }));
}));

// Court money collected: marks the booking paid and asks both captains "Did you win?".
teamsRouter.post("/challenges/:id/venue-paid", requirePermission("teams.venuepaid"), handler(async (req, res) => {
  const id = param(req, "id");
  const c = await prisma.challenge.findUnique({ where: { id } });
  if (!c) throw new AppError(404, "Challenge not found");
  if (c.status !== "accepted") throw new AppError(409, "Only accepted challenge games are paid at the venue");
  if (c.venuePaidAt) return send(res, { alreadyPaid: true }, "Already marked paid");
  await prisma.challenge.update({ where: { id }, data: { venuePaidAt: new Date(), venuePaidBy: req.staff!.id } });
  if (c.bookingId) {
    const b = await prisma.booking.findUnique({ where: { id: c.bookingId } });
    if (b) await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "completed", amountPaidNow: b.totalPrice, remainingAmount: 0, cashAmount: b.totalPrice } });
  }
  for (const t of await prisma.team.findMany({ where: { id: { in: [c.challengerTeamId, c.challengedTeamId] } } })) {
    await notify(prisma, {
      userId: t.captainId, type: "match", title: "Payment confirmed. Did you win?",
      message: "The venue confirmed your payment. Update your score in your dashboard to boost your public visibility.",
      href: `/opponent?report=${id}`, dedupeKey: `venue-paid-${id}-${t.captainId}`,
    });
  }
  await audit(req, "venue-paid", "challenge", id);
  send(res, { alreadyPaid: false }, "Marked as paid");
}));

// One team: roster with names, record, and its challenges
teamsRouter.get("/:id", requirePermission("teams.view"), handler(async (req, res) => {
  const t = await prisma.team.findUnique({ where: { id: param(req, "id") }, include: { members: true } });
  if (!t) throw new AppError(404, "Team not found");
  const roster = t.members.some((m) => m.userId === t.captainId) ? t.members : [...t.members, { userId: t.captainId, position: "MID", joinedAt: t.createdAt }];
  const users = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: roster.map((m) => m.userId) } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const rec = (await records([t.id])).get(t.id) ?? blank;
  const ch = await prisma.challenge.findMany({ where: { OR: [{ challengerTeamId: t.id }, { challengedTeamId: t.id }] }, orderBy: [{ date: "desc" }, { startHour: "desc" }], take: 20, include: { results: true } });
  const other = [...new Set(ch.map((c) => (c.challengerTeamId === t.id ? c.challengedTeamId : c.challengerTeamId)))];
  const names = new Map((await prisma.team.findMany({ where: { id: { in: other } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  send(res, {
    id: t.id, name: t.name, area: t.area, createdAt: t.createdAt, record: rec,
    members: roster.map((m) => ({ phone: m.userId, name: users.get(m.userId) ?? null, position: m.position, captain: m.userId === t.captainId, joinedAt: m.joinedAt })).sort((a, b) => Number(b.captain) - Number(a.captain)),
    challenges: ch.map((c) => {
      const r = c.results[0];
      const mine = r ? (r.submittedByTeamId === t.id ? [r.scoreSubmitter, r.scoreOther] : [r.scoreOther, r.scoreSubmitter]) : null;
      return { id: c.id, status: c.status, date: c.date, startHour: c.startHour, versus: names.get(c.challengerTeamId === t.id ? c.challengedTeamId : c.challengerTeamId) ?? "Team", youChallenged: c.challengerTeamId === t.id, result: r && mine ? { status: r.status, goalsFor: mine[0], goalsAgainst: mine[1] } : null };
    }),
  });
}));
