import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, app, customer, PASSWORD, prisma, request, reset, staff, todayKey } from "./helpers";
import { setPushSender } from "../src/lib/push";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

async function staffWith(permissions: string[], email = "t@test.np") {
  const s = await prisma.staffUser.create({ data: { email, name: "Table Staff", role: "staff", permissions, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { id: s.id, auth: { Authorization: `Bearer ${login.body.data.token}` } as Record<string, string> };
}

const cup = () => prisma.tournament.create({ data: { name: "Dashain Cup", prizePool: 50000, minTeams: 4, maxTeams: 8, startDate: todayKey(), endDate: addDaysKey(todayKey(), 5) } });
const host = (token: string, path = "") => request(app).get(`/api/admin/host/${token}${path}`);
const hostPost = (token: string, path: string, body: object = {}) => request(app).post(`/api/admin/host/${token}${path}`).send(body);

// a tournament with a two-round sheet: Red v Blue and Gold v Green, then the final
async function sheet(owner: { auth: Record<string, string> }) {
  const t = await cup();
  const put = await api.put(`/tournaments/${t.id}/tiesheet`, owner.auth, { rounds: [
    { name: "Semi-finals", matches: [{ home: "Red", away: "Blue", startsAt: new Date(Date.now() + 3600_000).toISOString(), venue: "Court 1" }, { home: "Gold", away: "Green" }] },
    { name: "Final", matches: [{}] },
  ] });
  assert.equal(put.status, 200);
  return { t, rounds: put.body.data.rounds as { id: string; name: string; matches: { id: string; goals: unknown[] }[] }[] };
}

describe("Tournament page: staff", () => {
  it("each action needs its own tick", async () => {
    const owner = await staff("owner");
    const { t } = await sheet(owner);
    const viewer = await staffWith(["tournaments.view"], "v@test.np");
    const none = await staffWith([], "n@test.np");
    assert.equal((await api.get("/tournaments", none.auth)).status, 403);
    assert.equal((await api.get("/tournaments", viewer.auth)).status, 200);
    assert.equal((await api.put(`/tournaments/${t.id}/tiesheet`, viewer.auth, { rounds: [] })).status, 403);
    assert.equal((await api.post(`/tournaments/${t.id}/host-link`, viewer.auth)).status, 403);
    const detail = await api.get(`/tournaments/${t.id}`, viewer.auth);
    assert.equal(detail.body.data.hostLink, null, "the link itself is for people who may share it");
    assert.equal(detail.body.data.canShare, false);
  });

  it("lists tournaments with their sheet counts and shows one with its rounds", async () => {
    const owner = await staff("owner");
    const { t } = await sheet(owner);
    await prisma.registration.create({ data: { tournamentId: t.id, teamName: "Red", captainName: "C", contactEmail: "c@x.np", contactPhone: "9800000001", players: "[]" } });
    const list = (await api.get("/tournaments", owner.auth)).body.data;
    assert.deepEqual([list[0].name, list[0].state, list[0].registrations, list[0].matches], ["Dashain Cup", "live", 1, 3]);
    const one = (await api.get(`/tournaments/${t.id}`, owner.auth)).body.data;
    assert.deepEqual(one.rounds.map((r: { name: string }) => r.name), ["Semi-finals", "Final"]);
    assert.equal(one.rounds[0].matches[0].home, "Red");
    assert.equal((await api.get("/tournaments/nope", owner.auth)).status, 404);
  });

  it("saving the sheet keeps a match's score, goals and followers; only structure changes", async () => {
    const owner = await staff("owner");
    const { t, rounds } = await sheet(owner);
    const m = rounds[0].matches[0];
    await customer("9810000001", "Fan");
    await prisma.matchFollow.create({ data: { userId: "9810000001", matchId: m.id } });
    await api.post(`/tournaments/matches/${m.id}/goal`, owner.auth, { side: "home", minute: 10, scorer: "Ram" });

    // rename a team and add a match, sending ids back; a stale copy must not undo the score
    const now = (await api.get(`/tournaments/${t.id}`, owner.auth)).body.data.rounds;
    const edited = now.map((r: { id: string; name: string; matches: { id: string; home: string | null; away: string | null }[] }) => ({
      id: r.id, name: r.name, matches: r.matches.map((x) => ({ id: x.id, home: x.id === m.id ? "Red Devils" : x.home, away: x.away })),
    }));
    edited[1].matches.push({ home: "Red Devils", away: "Gold" });
    const saved = (await api.put(`/tournaments/${t.id}/tiesheet`, owner.auth, { rounds: edited })).body.data.rounds;
    assert.equal(saved[0].matches[0].id, m.id, "same row");
    assert.equal(saved[0].matches[0].home, "Red Devils");
    assert.equal(saved[0].matches[0].homeScore, 1, "score kept");
    assert.equal(saved[0].matches[0].status, "live");
    assert.equal(saved[0].matches[0].goals.length, 1);
    assert.equal(saved[1].matches.length, 2);
    assert.equal(await prisma.matchFollow.count({ where: { matchId: m.id } }), 1);

    // leaving a match out removes it with its goals and followers
    const without = saved.map((r: { id: string; name: string; matches: { id: string }[] }, i: number) => ({ id: r.id, name: r.name, matches: r.matches.filter((x) => i !== 0 || x.id !== m.id).map((x) => ({ id: x.id })) }));
    await api.put(`/tournaments/${t.id}/tiesheet`, owner.auth, { rounds: without });
    assert.equal(await prisma.matchFollow.count({ where: { matchId: m.id } }), 0);
    assert.equal(await prisma.matchGoal.count({ where: { matchId: m.id } }), 0);

    assert.equal((await api.put(`/tournaments/${t.id}/tiesheet`, owner.auth, { rounds: [{ name: "", matches: [] }] })).status, 400);
    assert.equal((await api.put("/tournaments/nope/tiesheet", owner.auth, { rounds: [] })).status, 404);
  });

  it("kick-off, goals and full time update the score and tell followers (bell and push)", async () => {
    const owner = await staff("owner");
    const { rounds } = await sheet(owner);
    const [m, other] = rounds[0].matches;
    await customer("9810000002", "Fan A");
    await customer("9810000003", "Fan B");
    await prisma.matchFollow.createMany({ data: [{ userId: "9810000002", matchId: m.id }, { userId: "9810000003", matchId: other.id }] });
    await prisma.pushSubscription.create({ data: { userId: "9810000002", endpoint: "https://push.test/fan-a", p256dh: "k", auth: "a" } });
    const sent: string[] = [];
    setPushSender(async (_sub, payload) => { sent.push(JSON.parse(payload).title); });
    try {
      const kick = await api.post(`/tournaments/matches/${m.id}/status`, owner.auth, { status: "live" });
      assert.deepEqual([kick.body.data.match.status, kick.body.data.match.homeScore, kick.body.data.match.awayScore], ["live", 0, 0]);
      const g1 = await api.post(`/tournaments/matches/${m.id}/goal`, owner.auth, { side: "home", minute: 12, scorer: "Ram" });
      assert.equal(g1.status, 201);
      await api.post(`/tournaments/matches/${m.id}/goal`, owner.auth, { side: "away", minute: 30 });
      const g3 = await api.post(`/tournaments/matches/${m.id}/goal`, owner.auth, { side: "home", minute: 55, scorer: "Hari" });
      assert.deepEqual([g3.body.data.match.homeScore, g3.body.data.match.awayScore], [2, 1]);
      assert.deepEqual(g3.body.data.match.goals.map((g: { minute: number }) => g.minute), [12, 30, 55], "goal log in minute order");
      assert.equal(g3.body.data.followers, 1);

      // a mistaken goal is taken back: score drops, nobody is told
      const undo = await api.del(`/tournaments/goals/${g3.body.data.match.goals[2].id}`, owner.auth);
      assert.deepEqual([undo.body.data.match.homeScore, undo.body.data.match.awayScore], [1, 1]);

      const end = await api.post(`/tournaments/matches/${m.id}/status`, owner.auth, { status: "finished", note: "Red won on penalties" });
      assert.equal(end.body.data.match.status, "finished");
      assert.equal((await api.post(`/tournaments/matches/${m.id}/goal`, owner.auth, { side: "home" })).status, 409, "finished: reopen first");
      assert.equal((await api.post(`/tournaments/matches/${m.id}/status`, owner.auth, { status: "live" })).status, 200, "reopened");

      const bell = await prisma.notification.findMany({ where: { userId: "9810000002", type: "tournament" }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(bell.map((n) => n.title), ["Kick-off: it is live", "Goal!", "Goal!", "Goal!", "Full time"]);
      assert.equal(bell[1].message, "Red 1-0 Blue");
      assert.equal(bell[4].message, "Red 1-1 Blue (Red won on penalties)");
      assert.equal(await prisma.notification.count({ where: { userId: "9810000003", type: "tournament" } }), 0, "B follows another match");
      assert.deepEqual(sent.slice(0, 2), ["Kick-off: it is live", "Goal!"]);
    } finally {
      setPushSender(null);
    }
    const log = await prisma.adminAuditLog.findMany({ where: { entity: "tournament", action: { startsWith: "goal" } } });
    assert.ok(log.length >= 4);

    // teams must be set before a match can start; scores can be corrected
    const tbd = rounds[1].matches[0];
    assert.equal((await api.post(`/tournaments/matches/${tbd.id}/status`, owner.auth, { status: "live" })).status, 409);
    assert.equal((await api.post(`/tournaments/matches/${other.id}/goal`, owner.auth, { side: "sideways" })).status, 400);
    await api.post(`/tournaments/matches/${other.id}/status`, owner.auth, { status: "live", homeScore: 3, awayScore: 2 });
    assert.equal((await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: other.id } })).homeScore, 3);
  });
});

describe("Tournament page: the host link", () => {
  it("is made, renewed and switched off by staff who may share; the old link dies on renewal", async () => {
    const owner = await staff("owner");
    const { t } = await sheet(owner);
    const editor = await staffWith(["tournaments.view", "tournaments.edit"], "e@test.np");
    assert.equal((await api.post(`/tournaments/${t.id}/host-link`, editor.auth)).status, 403);

    const first = (await api.post(`/tournaments/${t.id}/host-link`, owner.auth)).body.data;
    assert.match(first.token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(first.active, true);
    assert.equal((await host(first.token)).status, 200);
    assert.equal((await api.get(`/tournaments/${t.id}`, owner.auth)).body.data.hostLink.token, first.token);

    const second = (await api.post(`/tournaments/${t.id}/host-link`, owner.auth)).body.data;
    assert.notEqual(second.token, first.token);
    assert.equal((await host(first.token)).status, 404, "old link stopped");
    assert.equal((await host(second.token)).status, 200);

    assert.equal((await api.del(`/tournaments/${t.id}/host-link`, owner.auth)).status, 200);
    assert.equal((await host(second.token)).status, 404, "switched off");
    assert.equal((await host("x".repeat(32))).status, 404);
  });

  it("an expired link says so", async () => {
    const owner = await staff("owner");
    const { t } = await sheet(owner);
    const link = (await api.post(`/tournaments/${t.id}/host-link`, owner.auth)).body.data;
    await prisma.tournamentHostLink.update({ where: { tournamentId: t.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await host(link.token);
    assert.equal(r.status, 410);
    assert.match(r.body.message, /expired/);
  });

  it("lets the host see goals, add goals, kick off and finish, and edit the sheet, with no staff sign-in", async () => {
    const owner = await staff("owner");
    const { t, rounds } = await sheet(owner);
    await prisma.registration.create({ data: { tournamentId: t.id, teamName: "Red", captainName: "Cap", contactEmail: "cap@x.np", contactPhone: "9800000009", players: "[]" } });
    const { token } = (await api.post(`/tournaments/${t.id}/host-link`, owner.auth)).body.data;
    const m = rounds[0].matches[0];

    const view = await host(token);
    assert.equal(view.body.data.tournament.name, "Dashain Cup");
    assert.equal(view.body.data.rounds.length, 2);
    const text = JSON.stringify(view.body);
    assert.ok(!text.includes("9800000009") && !text.includes("cap@x.np") && !text.includes("prizePool"), "no contacts or money on the host page");

    assert.equal((await hostPost(token, `/matches/${m.id}/status`, { status: "live" })).status, 200);
    const goal = await hostPost(token, `/matches/${m.id}/goal`, { side: "away", minute: 7, scorer: "Sita" });
    assert.equal(goal.status, 201);
    assert.deepEqual([goal.body.data.match.homeScore, goal.body.data.match.awayScore], [0, 1]);
    const undo = await request(app).delete(`/api/admin/host/${token}/goals/${goal.body.data.match.goals[0].id}`);
    assert.equal(undo.status, 200);
    assert.equal(undo.body.data.match.awayScore, 0);

    const edit = await request(app).put(`/api/admin/host/${token}/tiesheet`).send({ rounds: view.body.data.rounds.map((r: { id: string; name: string; matches: { id: string; home: string | null; away: string | null }[] }) => ({ id: r.id, name: r.name === "Final" ? "Grand Final" : r.name, matches: r.matches.map((x) => ({ id: x.id, home: x.home, away: x.away })) })) });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.data.rounds[1].name, "Grand Final");
    assert.equal(edit.body.data.rounds[0].matches[0].status, "live", "saving the sheet never changes a live score");

    const audit = await prisma.adminAuditLog.findMany({ where: { staffName: "Host link" } });
    assert.ok(audit.length >= 4 && audit.every((a) => a.staffId.startsWith("host:")));
  });

  it("opens one tournament only", async () => {
    const owner = await staff("owner");
    const a = await sheet(owner);
    const b = await prisma.tournament.create({ data: { name: "Other Cup", prizePool: 1, minTeams: 2, maxTeams: 4, startDate: todayKey(), endDate: addDaysKey(todayKey(), 2) } });
    const round = await prisma.tournamentRound.create({ data: { tournamentId: b.id, name: "Final", position: 0 } });
    const foreign = await prisma.tournamentMatch.create({ data: { roundId: round.id, home: "X", away: "Y" } });
    const { token } = (await api.post(`/tournaments/${a.t.id}/host-link`, owner.auth)).body.data;
    assert.equal((await hostPost(token, `/matches/${foreign.id}/status`, { status: "live" })).status, 404);
    assert.equal((await hostPost(token, `/matches/${foreign.id}/goal`, { side: "home" })).status, 404);
    assert.equal((await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: foreign.id } })).status, "upcoming");
  });
});
