import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const today = todayKey();
let n = 0;
async function game(over: Record<string, unknown>, players: { userId?: string; name: string; isBot?: boolean; result?: string; fee?: boolean; win?: boolean }[]) {
  const started = new Date(Date.now() - 120_000);
  const g = await prisma.ludoGame.create({
    data: { code: `T${String(++n).padStart(5, "0")}`, mode: "solo", status: "completed", hostId: players[0].userId ?? "x", day: today, startedAt: started, finishedAt: new Date(started.getTime() + 90_000), ...over },
  });
  for (const [seat, p] of players.entries()) {
    let feeEntryId: string | null = null, rewardEntryId: string | null = null;
    if (p.userId && p.fee !== false) {
      feeEntryId = (await prisma.loyaltyEntry.create({ data: { userId: p.userId, kind: "ludo", points: -1, earnedOn: today, sourceType: "ludo_fee", sourceId: `${g.id}:${p.userId}`, detail: "fee" } })).id;
    }
    if (p.userId && p.win) {
      rewardEntryId = (await prisma.loyaltyEntry.create({ data: { userId: p.userId, kind: "ludo", points: 2, earnedOn: today, sourceType: "ludo_win", sourceId: `${g.id}:${p.userId}`, detail: "win" } })).id;
    }
    await prisma.ludoPlayer.create({ data: { gameId: g.id, seat, userId: p.userId ?? null, name: p.name, isBot: !!p.isBot, result: p.result ?? null, feeEntryId, rewardEntryId } });
  }
  return g;
}

describe("Unique Ludo statistics", () => {
  it("adds up games, players and the points moved, lists the games and opens one with its dice log", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Ludo One");
    await customer("9800000892", "Ludo Two");
    const a = await game({ winnerSeat: 0 }, [{ userId: "9800000891", name: "Ludo One", result: "won", win: true }, { name: "Aarav (CPU)", isBot: true, result: "lost" }]);
    await game({ mode: "multi", winnerSeat: 1 }, [{ userId: "9800000891", name: "Ludo One", result: "lost" }, { userId: "9800000892", name: "Ludo Two", result: "won", win: true }]);
    await game({ status: "abandoned", finishedAt: new Date() }, [{ userId: "9800000892", name: "Ludo Two", result: "left" }]);
    await game({ status: "cancelled", startedAt: null, finishedAt: null, day: null }, [{ userId: "9800000891", name: "Ludo One", fee: false }]);
    await prisma.ludoEvent.create({ data: { gameId: a.id, seq: 1, seat: 0, kind: "roll", value: 6 } });

    const r = await api.get("/ludo", mgr.auth);
    assert.equal(r.status, 200);
    const t = r.body.data.totals.today;
    assert.deepEqual([t.games, t.solo, t.multi, t.completed, t.abandoned, t.players], [3, 2, 1, 2, 1, 2]);
    assert.deepEqual([t.pointsCollected, t.pointsGiven, t.rewards], [4, 4, 2]);
    assert.equal(r.body.data.byDay.length, 14);
    assert.equal(r.body.data.byDay[13].games, 3);
    assert.equal(r.body.data.total, 3, "a lobby that never started is not a game");

    const multi = await api.get("/ludo?mode=multi", mgr.auth);
    assert.ok(multi.body.data.items.every((g: { mode: string }) => g.mode === "multi"));
    const search = await api.get("/ludo?q=Ludo%20Two", mgr.auth);
    assert.equal(search.body.data.items.length, 2);
    const item = r.body.data.items.find((g: { id: string }) => g.id === a.id);
    assert.ok(item.players.some((p: { isBot: boolean }) => p.isBot));

    const d = await api.get(`/ludo/${a.id}`, mgr.auth);
    assert.equal(d.status, 200);
    assert.equal(d.body.data.events[0].value, 6);
    assert.equal(d.body.data.players[0].reward.points, 2);
    assert.equal(d.body.data.players[0].fee.points, -1);
    assert.equal((await api.get("/ludo/nope", mgr.auth)).status, 404);
  });

  it("flags players with many wins or the same pair playing each other again and again", async () => {
    const mgr = await staff("admin");
    await customer("9800000893", "Pair A");
    await customer("9800000894", "Pair B");
    for (let i = 0; i < 5; i++) await game({ mode: "multi", winnerSeat: 0 }, [{ userId: "9800000893", name: "Pair A", result: "won", win: true }, { userId: "9800000894", name: "Pair B", result: "lost" }]);
    const r = await api.get("/ludo", mgr.auth);
    const flag = r.body.data.flags.find((f: { phone: string }) => f.phone === "9800000893");
    assert.ok(flag, "the pair is flagged");
    assert.match(flag.reasons.join(" "), /5 games against 9800000894/);
  });

  it("is for staff with the Unique Ludo permission only", async () => {
    assert.equal((await api.get("/ludo", {})).status, 401);
    const nobody = await staff("academy");
    assert.equal((await api.get("/ludo", nobody.auth)).status, 403);
  });
});
