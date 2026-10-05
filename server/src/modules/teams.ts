import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify } from "../lib/customer-effects";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const teamsRouter = Router();

teamsRouter.get("/", requirePermission("teams.read"), handler(async (_req, res) => {
  const teams = await prisma.team.findMany({ include: { members: true }, orderBy: { createdAt: "desc" } });
  send(res, teams.map((t) => ({ id: t.id, name: t.name, area: t.area, captainId: t.captainId, members: t.members.length, createdAt: t.createdAt })));
}));

teamsRouter.get("/disputes", requirePermission("teams.read"), handler(async (_req, res) => {
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
teamsRouter.post("/results/:id/resolve", requirePermission("teams.write"), handler(async (req, res) => {
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
teamsRouter.get("/settlements", requirePermission("teams.read"), handler(async (req, res) => {
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
teamsRouter.post("/challenges/:id/venue-paid", requirePermission("teams.write"), handler(async (req, res) => {
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
