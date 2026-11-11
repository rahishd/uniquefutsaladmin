import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const day = addDaysKey(todayKey(), 1);
const hosted = async (admin: { auth: Record<string, string> }, name: string, date = day) =>
  (await api.post("/tournaments", admin.auth, { name, hostName: "Anil Gurung", hostPhone: "9841000000", minRate: 2000, days: [{ date, startHour: 9, endHour: 12 }] })).body.data.id as string;

describe("Tournament Organizer: prizes", () => {
  it("the organizer writes the prizes of a tournament given to them, and the prize pool is the cash added up", async () => {
    const admin = await staff("admin");
    const org = await staff("organizer", "org@test.np");
    const id = await hosted(admin, "Prize Cup");
    await prisma.tournamentOrganizer.create({ data: { staffId: org.id, tournamentId: id } });

    const none = await api.get("/organizer/me", org.auth);
    assert.deepEqual(none.body.data.tournaments[0].prizes, [], "no prizes at first");

    const body = { prizes: [
      { place: "1st", cash: 50000, trophy: "Winner trophy and medals", note: "" },
      { place: "2nd", cash: 25000, trophy: "Runner-up trophy", note: "Plus a football" },
      { place: "Best player", cash: 0, trophy: "Golden boot" },
    ] };
    const saved = await api.put(`/organizer/tournaments/${id}/prizes`, org.auth, body);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.prizePool, 75000);
    const me = await api.get("/organizer/me", org.auth);
    assert.equal(me.body.data.tournaments[0].prizePool, 75000);
    assert.deepEqual(me.body.data.tournaments[0].prizes.map((p: { place: string; cash: number }) => [p.place, p.cash]), [["1st", 50000], ["2nd", 25000], ["Best player", 0]]);
    assert.equal(me.body.data.tournaments[0].prizes[2].note, "", "a missing note is empty");
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "prizes", entityId: id } }), 1);

    // saving again replaces them
    assert.equal((await api.put(`/organizer/tournaments/${id}/prizes`, org.auth, { prizes: [{ place: "1st", cash: 1000 }] })).body.data.prizePool, 1000);
    assert.equal((await api.put(`/organizer/tournaments/${id}/prizes`, org.auth, { prizes: [] })).body.data.prizePool, 0);
  });

  it("refuses a tournament that is not theirs, a bad prize, staff who are not organizers, and anyone not signed in", async () => {
    const admin = await staff("admin");
    const org = await staff("organizer", "org@test.np");
    const other = await staff("organizer", "other@test.np");
    const mine = await hosted(admin, "Mine");
    const theirs = await hosted(admin, "Theirs", addDaysKey(todayKey(), 2));
    await prisma.tournamentOrganizer.createMany({ data: [{ staffId: org.id, tournamentId: mine }, { staffId: other.id, tournamentId: theirs }] });
    const one = { prizes: [{ place: "1st", cash: 100 }] };
    assert.equal((await api.put(`/organizer/tournaments/${theirs}/prizes`, org.auth, one)).status, 403, "not assigned to me");
    assert.equal((await api.put(`/organizer/tournaments/${mine}/prizes`, org.auth, { prizes: [{ place: "", cash: 10 }] })).status, 400, "a place is needed");
    assert.equal((await api.put(`/organizer/tournaments/${mine}/prizes`, org.auth, { prizes: [{ place: "1st", cash: -5 }] })).status, 400, "no negative cash");
    assert.equal((await api.put(`/organizer/tournaments/${mine}/prizes`, org.auth, { prizes: Array.from({ length: 13 }, (_, i) => ({ place: `P${i}`, cash: 1 })) })).status, 400, "at most 12");
    assert.equal((await api.put(`/organizer/tournaments/${mine}/prizes`, admin.auth, one)).status, 403, "staff are not organizers");
    assert.equal((await api.put(`/organizer/tournaments/${mine}/prizes`, {}, one)).status, 401);
    assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: mine } })).prizePool, 0, "nothing was saved");
  });
});
