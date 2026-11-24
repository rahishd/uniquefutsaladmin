import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, prisma, reset, staff, todayKey } from "./helpers";
import { currentHour } from "../src/lib/dates";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const make = (name: string, start: string, end: string, extra: object = {}) =>
  prisma.tournament.create({ data: { name, prizePool: 1000, minTeams: 2, maxTeams: 8, startDate: start, endDate: end, ...extra } });

describe("A tournament whose last day has passed", () => {
  it("shows as Finished with nothing live, even if staff never closed it and a match was left on live", async () => {
    const owner = await staff("owner");
    const t = await make("Tilottama Cup", addDaysKey(todayKey(), -9), addDaysKey(todayKey(), -7));
    const round = await prisma.tournamentRound.create({ data: { tournamentId: t.id, name: "Group", position: 0 } });
    await prisma.tournamentMatch.create({ data: { roundId: round.id, home: "A", away: "B", status: "live" } });
    await prisma.tournamentMatch.create({ data: { roundId: round.id, home: "C", away: "D", status: "upcoming" } });

    const row = (await api.get("/tournaments", owner.auth)).body.data.find((x: { id: string }) => x.id === t.id);
    assert.equal(row.state, "completed");
    assert.equal(row.live, 0);
    assert.equal(row.matches, 2);
  });

  it("is still Running on its last day, Coming up before its first day, and a closed one stays Finished", async () => {
    const owner = await staff("owner");
    const today = todayKey();
    const running = await make("Running Cup", addDaysKey(today, -2), today); // ends today
    const coming = await make("Coming Cup", addDaysKey(today, 3), addDaysKey(today, 5));
    const closed = await make("Closed Cup", addDaysKey(today, -1), addDaysKey(today, 4), { status: "completed" });
    const list = (await api.get("/tournaments", owner.auth)).body.data as { id: string; state: string }[];
    const state = (id: string) => list.find((x) => x.id === id)?.state;
    assert.equal(state(running.id), "live");
    assert.equal(state(coming.id), "upcoming");
    assert.equal(state(closed.id), "completed");
  });

  it("on its last day it is Finished as soon as that day's court hours are over, and still Running before that", async () => {
    const owner = await staff("owner");
    const today = todayKey();
    const hour = currentHour();
    const over = await make("Over Cup", addDaysKey(today, -2), today, { hostedEvent: true });
    await prisma.tournamentDay.create({ data: { tournamentId: over.id, date: today, startHour: Math.max(0, hour - 3), endHour: hour } }); // its hours ended this hour
    const still = await make("Still Cup", addDaysKey(today, -2), today, { hostedEvent: true });
    await prisma.tournamentDay.create({ data: { tournamentId: still.id, date: today, startHour: hour, endHour: hour + 1 } }); // its hours are not over yet
    const list = (await api.get("/tournaments", owner.auth)).body.data as { id: string; state: string }[];
    const state = (id: string) => list.find((x) => x.id === id)?.state;
    assert.equal(state(over.id), "completed");
    assert.equal(state(still.id), "live");
  });

  it("a hosted event in the list carries its bill: the total and what is still due (Due while unpaid, Paid once settled)", async () => {
    const owner = await staff("owner");
    const today = todayKey();
    const t = await make("Bill Cup", addDaysKey(today, 1), addDaysKey(today, 1), { hostedEvent: true, hostName: "Anil", minRate: 1000 });
    await prisma.tournamentDay.create({ data: { tournamentId: t.id, date: addDaysKey(today, 1), startHour: 9, endHour: 12 } }); // 3 hours at Rs. 1,000
    const get = async () => ((await api.get("/tournaments", owner.auth)).body.data as { id: string; billTotal?: number; billDue?: number }[]).find((x) => x.id === t.id)!;
    let row = await get();
    assert.equal(row.billTotal, 3000);
    assert.equal(row.billDue, 3000);
    await prisma.tournamentPayment.create({ data: { tournamentId: t.id, cash: 3000, receivedBy: "test" } });
    row = await get();
    assert.equal(row.billDue, 0);
  });
});
