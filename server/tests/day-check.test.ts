import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey, addDaysKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

// a game played and paid in cash: Rs. 1500
const cashGame = async (date = today, startTime = "18:00", endTime = "19:00") => {
  if (!(await prisma.user.findUnique({ where: { phoneNumber: "9880000001" } }))) await customer("9880000001", "Raju");
  return prisma.booking.create({ data: { userId: "9880000001", customerName: "Raju", date, startTime, endTime, duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "venue", status: "confirmed", paymentStatus: "completed" } });
};

describe("Owner daily check", () => {
  it("is for the owner only", async () => {
    const admin = await staff("admin", "admin@test.np");
    assert.equal((await api.get("/day-check", admin.auth)).status, 403);
    assert.equal((await api.post("/day-check", admin.auth, { date: today, receivedCash: 0, receivedFonepay: 0 })).status, 403);
    assert.equal((await api.del(`/day-check/${today}`, admin.auth)).status, 403);
  });

  it("shows the day money and whether it is checked", async () => {
    const owner = await staff("owner");
    await cashGame();
    const r = (await api.get("/day-check", owner.auth)).body.data;
    assert.equal(r.date, today);
    assert.equal(r.figures.cash, 1500);
    assert.equal(r.figures.fonepay, 0);
    assert.equal(r.figures.total, 1500);
    assert.equal(r.figures.games, 1);
    assert.equal(r.check, null);
    assert.equal(r.history.length, 14);
    assert.equal(r.history[0].day, today);
    assert.equal(r.history[0].checked, false);
  });

  it("marks the day checked with the amounts received, and shows the difference", async () => {
    const owner = await staff("owner");
    await cashGame();
    const c = await api.post("/day-check", owner.auth, { date: today, receivedCash: 1400, receivedFonepay: 0, note: "Rs. 100 short" });
    assert.equal(c.status, 201);
    assert.equal(c.body.data.expectedCash, 1500);
    assert.equal(c.body.data.differenceCash, -100);
    assert.equal(c.body.data.difference, -100);
    assert.equal(c.body.data.checkedByName, "owner person");

    const r = (await api.get("/day-check", owner.auth)).body.data;
    assert.equal(r.check.receivedCash, 1400);
    assert.equal(r.changedSinceCheck, false);
    assert.equal(r.history[0].checked, true);
    assert.equal(r.history[0].difference, -100);

    assert.equal((await api.post("/day-check", owner.auth, { date: today, receivedCash: 1500, receivedFonepay: 0 })).status, 409, "one check per day");
    assert.ok(await prisma.adminAuditLog.findFirst({ where: { entity: "day-check", action: "check" } }));
  });

  it("warns when the takings change after the day was checked, and the day can be reopened", async () => {
    const owner = await staff("owner");
    await cashGame();
    await api.post("/day-check", owner.auth, { date: today, receivedCash: 1500, receivedFonepay: 0 });
    await cashGame(today, "20:00", "21:00"); // a late payment
    assert.equal((await api.get("/day-check", owner.auth)).body.data.changedSinceCheck, true);

    assert.equal((await api.del(`/day-check/${today}`, owner.auth)).status, 200);
    assert.equal((await api.get("/day-check", owner.auth)).body.data.check, null);
    assert.equal((await api.del(`/day-check/${today}`, owner.auth)).status, 404);
    assert.ok(await prisma.adminAuditLog.findFirst({ where: { entity: "day-check", action: "reopen" } }));
    assert.equal((await api.post("/day-check", owner.auth, { date: today, receivedCash: 3000, receivedFonepay: 0 })).status, 201);
  });

  it("an earlier day can be checked; the future and bad amounts cannot", async () => {
    const owner = await staff("owner");
    const yesterday = addDaysKey(today, -1);
    await cashGame(yesterday);
    assert.equal((await api.get(`/day-check?date=${yesterday}`, owner.auth)).body.data.figures.cash, 1500);
    assert.equal((await api.post("/day-check", owner.auth, { date: yesterday, receivedCash: 1500, receivedFonepay: 0 })).status, 201);
    assert.equal((await api.get(`/day-check?date=${addDaysKey(today, 1)}`, owner.auth)).status, 400);
    assert.equal((await api.post("/day-check", owner.auth, { date: addDaysKey(today, 1), receivedCash: 0, receivedFonepay: 0 })).status, 400);
    assert.equal((await api.post("/day-check", owner.auth, { date: today, receivedCash: -5, receivedFonepay: 0 })).status, 400);
    assert.equal((await api.post("/day-check", owner.auth, { date: today, receivedCash: "lots", receivedFonepay: 0 })).status, 400);
  });
});
