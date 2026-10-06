import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

async function league() {
  await customer("9810000001", "Raju Captain"); await customer("9810000002", "Sita Captain"); await customer("9810000003", "Hari Player");
  const red = await prisma.team.create({ data: { name: "Reds", area: "Tilottama", captainId: "9810000001" } });
  const blue = await prisma.team.create({ data: { name: "Blues", captainId: "9810000002" } });
  await prisma.teamMember.createMany({ data: [{ teamId: red.id, userId: "9810000001", position: "GK" }, { teamId: red.id, userId: "9810000003", position: "FWD" }, { teamId: blue.id, userId: "9810000002" }] });
  const mk = (date: string, status: string, extra: object = {}) => prisma.challenge.create({ data: { challengerTeamId: red.id, challengedTeamId: blue.id, type: "match", date, startHour: 18, courtPrice: 2000, loserPct: 70, status, ...extra } });
  return { red, blue, mk };
}

describe("Teams & Challenges admin", () => {
  it("lists teams with captain, roster size and a record from approved results only", async () => {
    const { red, blue, mk } = await league();
    const done = await mk(addDaysKey(today, -2), "accepted");
    await prisma.challengeResult.create({ data: { challengeId: done.id, submittedByTeamId: red.id, scoreSubmitter: 3, scoreOther: 1, status: "approved" } });
    const waiting = await mk(addDaysKey(today, -1), "accepted");
    await prisma.challengeResult.create({ data: { challengeId: waiting.id, submittedByTeamId: blue.id, scoreSubmitter: 5, scoreOther: 0, status: "awaiting_approval" } }); // changes nothing yet
    await mk(addDaysKey(today, 3), "pending");
    const fd = await staff("frontdesk");
    const list = (await api.get("/teams", fd.auth)).body.data;
    const reds = list.find((t: { name: string }) => t.name === "Reds");
    assert.equal(reds.captain.name, "Raju Captain");
    assert.equal(reds.members, 2);
    assert.deepEqual([reds.record.played, reds.record.wins, reds.record.goalsFor, reds.record.goalsAgainst, reds.record.form.join("")], [1, 1, 3, 1, "W"]);
    assert.equal(reds.openChallenges, 1, "only the pending one: the accepted games are in the past");
    const blues = list.find((t: { name: string }) => t.name === "Blues");
    assert.equal(blues.record.losses, 1);
    assert.equal((await api.get("/teams?q=sita", fd.auth)).body.data.length, 1, "search by captain name");
    assert.equal(red.id.length > 0 && blue.id.length > 0, true);
  });

  it("shows one team with its roster (captain first) and challenges", async () => {
    const { red, mk } = await league();
    const c = await mk(addDaysKey(today, -2), "accepted");
    await prisma.challengeResult.create({ data: { challengeId: c.id, submittedByTeamId: red.id, scoreSubmitter: 2, scoreOther: 2, status: "approved" } });
    const fd = await staff("frontdesk");
    const t = (await api.get(`/teams/${red.id}`, fd.auth)).body.data;
    assert.equal(t.members[0].captain, true);
    assert.deepEqual(t.members.map((m: { name: string }) => m.name), ["Raju Captain", "Hari Player"]);
    assert.equal(t.challenges[0].versus, "Blues");
    assert.deepEqual(t.challenges[0].result, { status: "approved", goalsFor: 2, goalsAgainst: 2 });
    assert.equal((await api.get("/teams/nope", fd.auth)).status, 404);
  });

  it("lists challenges with status filter, search and the result; and counts for the top of the page", async () => {
    const { red, mk } = await league();
    await mk(addDaysKey(today, 2), "pending");
    const played = await mk(addDaysKey(today, -1), "accepted");
    await prisma.challengeResult.create({ data: { challengeId: played.id, submittedByTeamId: red.id, scoreSubmitter: 1, scoreOther: 0, status: "disputed" } });
    await mk(addDaysKey(today, -3), "declined");
    const fd = await staff("frontdesk");
    const all = (await api.get("/teams/challenges", fd.auth)).body.data;
    assert.equal(all.total, 3);
    assert.equal(all.items[0].challenger, "Reds");
    assert.equal((await api.get("/teams/challenges?status=accepted", fd.auth)).body.data.total, 1);
    assert.equal((await api.get("/teams/challenges?q=blues", fd.auth)).body.data.total, 3);
    assert.equal((await api.get("/teams/challenges?q=nobody", fd.auth)).body.data.total, 0);
    const accepted = (await api.get("/teams/challenges?status=accepted", fd.auth)).body.data.items[0];
    assert.deepEqual(accepted.result, { status: "disputed", submittedBy: "Reds", scoreSubmitter: 1, scoreOther: 0 });
    const o = (await api.get("/teams/overview", fd.auth)).body.data;
    assert.deepEqual([o.teams, o.pendingChallenges, o.disputes, o.unpaidGames, o.unpaidAmount], [2, 1, 1, 1, 2000]);
  });

  it("needs a signed-in staff member with the teams permission", async () => {
    assert.equal((await api.get("/teams", {})).status, 401);
    const acc = await staff("accountant");
    assert.equal((await api.get("/teams/overview", acc.auth)).status, 403);
  });
});
