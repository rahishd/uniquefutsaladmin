import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const today = todayKey();
async function game(userId: string, over: Record<string, unknown> = {}) {
  const started = new Date(Date.now() - 60_000);
  return prisma.goalRushGame.create({
    data: { userId, day: today, status: "completed", shotsTaken: 5, goals: 2, saves: 2, misses: 1, points: 2, startedAt: started, finishedAt: new Date(started.getTime() + 40_000), ...over },
  });
}

describe("Unique Goal Rush statistics", () => {
  it("adds up games, players, goals, saves and the points given, and lists the games", async () => {
    const mgr = await staff("admin");
    await customer("9800000881", "Kicker One");
    await customer("9800000882", "Kicker Two");
    await game("9800000881");
    await game("9800000881", { goals: 0, saves: 4, misses: 1, points: 0 });
    await game("9800000882", { status: "abandoned", shotsTaken: 1, goals: 1, saves: 0, misses: 0, points: 0, finishedAt: null });
    await game("9800000882", { day: addDaysKey(today, -40) });

    const r = await api.get("/goal-rush", mgr.auth);
    assert.equal(r.status, 200);
    const t = r.body.data.totals;
    assert.deepEqual([t.today.games, t.today.players, t.today.goals, t.today.saves, t.today.points, t.today.abandoned], [3, 2, 3, 6, 2, 1]);
    assert.equal(t.all.games, 4);
    assert.equal(t.all.points, 4);
    assert.equal(r.body.data.byDay.length, 14);
    assert.equal(r.body.data.byDay[13].games, 3);
    assert.equal(r.body.data.items[0].name !== undefined, true);

    const rewarded = await api.get("/goal-rush?rewarded=yes", mgr.auth);
    assert.ok(rewarded.body.data.items.every((g: { points: number }) => g.points > 0));
    const search = await api.get("/goal-rush?q=Kicker%20Two", mgr.auth);
    assert.ok(search.body.data.items.every((g: { phone: string }) => g.phone === "9800000882"));
  });

  it("flags players with many perfect or very fast games", async () => {
    const mgr = await staff("admin");
    await customer("9800000883", "Too Good");
    for (let i = 0; i < 3; i++) {
      const s = new Date(Date.now() - (i + 1) * 3600_000);
      await game("9800000883", { goals: 5, saves: 0, misses: 0, startedAt: s, finishedAt: new Date(s.getTime() + 5_000), day: addDaysKey(today, -i) });
    }
    const r = await api.get("/goal-rush", mgr.auth);
    const flag = r.body.data.flags.find((f: { phone: string }) => f.phone === "9800000883");
    assert.ok(flag, "flagged");
    assert.equal(flag.name, "Too Good");
    assert.ok(flag.reasons.some((x: string) => /perfect/.test(x)));
    assert.ok(flag.reasons.some((x: string) => /under 8 seconds/.test(x)));
  });

  it("shows one game shot by shot with its reward reference", async () => {
    const mgr = await staff("admin");
    await customer("9800000884", "Shot Taker");
    const entry = await prisma.loyaltyEntry.create({ data: { userId: "9800000884", kind: "goal_rush", points: 2, earnedOn: today, expiresOn: addDaysKey(today, 90), sourceType: "goal_rush", sourceId: "x", detail: "Unique Goal Rush" } });
    const g = await game("9800000884", { rewardId: entry.id });
    await prisma.goalRushShot.create({ data: { gameId: g.id, no: 1, aimX: 0.7, aimY: 0.7, power: 0.6, ballX: 0.72, ballY: 0.69, keeper: "BL", outcome: "goal" } });
    const r = await api.get(`/goal-rush/${g.id}`, mgr.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.shots.length, 1);
    assert.equal(r.body.data.reward.id, entry.id);
    assert.equal(r.body.data.reward.points, 2);
    assert.equal((await api.get("/goal-rush/nope", mgr.auth)).status, 404);
  });
});
