import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { extraChargeFor, extraMinutesAt } from "../src/lib/gz-clock";
import { api, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const session = (code: string, over: Record<string, unknown> = {}) =>
  prisma.gzBooking.create({ data: { code, guestName: "Shivanchu", guestPhone: "9877000111", consoleId: "c1", gameTitle: "GTA 5", date: today, startHour: 11, hours: 1, players: 1, total: 300, paymentMethod: "venue", paymentStatus: "pay_at_venue", status: "confirmed", ...over } });

// Moves the clock back as if the session had been running for this many minutes (the tests cannot wait an hour).
const ranFor = (code: string, minutes: number) => prisma.gzClock.update({ where: { bookingCode: code }, data: { startedAt: new Date(Date.now() - minutes * 60_000) } });

describe("gamezone session clock", () => {
  it("counts every started minute past the booked time and prices it per minute", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const at = (min: number, sec = 0) => new Date(start.getTime() + (min * 60 + sec) * 1000);
    assert.equal(extraMinutesAt(start, 60, at(59, 59)), 0);
    assert.equal(extraMinutesAt(start, 60, at(60)), 0);
    assert.equal(extraMinutesAt(start, 60, at(60, 1)), 1); // 1 second over = 1 started minute
    assert.equal(extraMinutesAt(start, 60, at(75)), 15);
    assert.equal(extraChargeFor(600, 15), 150); // Rs. 600 an hour = Rs. 10 a minute
    assert.equal(extraChargeFor(300, 1), 5);
  });

  it("start runs the clock once, only for today, and cancelling a started session is refused", async () => {
    const fd = await staff("frontdesk");
    await prisma.gzPlan.create({ data: { players: 1, label: "Solo", ratePerPersonHour: 300 } });
    await session("GZ-CLK");
    await session("GZ-TOMORROW", { date: "2099-01-01" });
    assert.equal((await api.post("/gamezone/bookings/GZ-TOMORROW/start", fd.auth)).status, 409);
    const ok = await api.post("/gamezone/bookings/GZ-CLK/start", fd.auth);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.bookedMinutes, 60);
    assert.equal(ok.body.data.hourlyRate, 300);
    assert.equal((await api.post("/gamezone/bookings/GZ-CLK/start", fd.auth)).status, 409);
    assert.equal((await api.post("/gamezone/bookings/GZ-CLK/cancel", fd.auth)).status, 409);
    const day = (await api.get(`/gamezone/day?date=${today}`, fd.auth)).body.data;
    assert.ok(day.serverNow);
    assert.equal(day.items.find((i: { code: string }) => i.code === "GZ-CLK").clock.bookedMinutes, 60);
  });

  it("one running session per console", async () => {
    const fd = await staff("frontdesk");
    await session("GZ-A");
    await session("GZ-B", { startHour: 13 });
    assert.equal((await api.post("/gamezone/bookings/GZ-A/start", fd.auth)).status, 200);
    assert.equal((await api.post("/gamezone/bookings/GZ-B/start", fd.auth)).status, 409);
    assert.equal((await api.post("/gamezone/bookings/GZ-A/complete", fd.auth)).status, 200);
    assert.equal((await api.post("/gamezone/bookings/GZ-B/start", fd.auth)).status, 200);
  });

  it("stopping inside the booked time adds nothing; it cannot be paid while it is running", async () => {
    const fd = await staff("frontdesk");
    await session("GZ-ONTIME");
    await api.post("/gamezone/bookings/GZ-ONTIME/start", fd.auth);
    assert.equal((await api.post("/gamezone/bookings/GZ-ONTIME/mark-paid", fd.auth)).status, 409); // still running
    await ranFor("GZ-ONTIME", 40);
    const r = await api.post("/gamezone/bookings/GZ-ONTIME/complete", fd.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.extraMinutes, 0);
    assert.equal((await prisma.gzBooking.findUnique({ where: { code: "GZ-ONTIME" } }))?.total, 300);
    assert.equal((await api.post("/gamezone/bookings/GZ-ONTIME/mark-paid", fd.auth)).status, 200);
  });

  it("extra minutes are billed per minute into the final bill", async () => {
    const fd = await staff("frontdesk");
    await session("GZ-OVER");
    await api.post("/gamezone/bookings/GZ-OVER/start", fd.auth);
    await ranFor("GZ-OVER", 75); // 15 minutes over a 1 hour session at Rs. 300 an hour
    const r = await api.post("/gamezone/bookings/GZ-OVER/complete", fd.auth);
    assert.equal(r.status, 200);
    assert.ok(r.body.data.extraMinutes >= 15 && r.body.data.extraMinutes <= 16);
    assert.equal(r.body.data.extraCharge, extraChargeFor(300, r.body.data.extraMinutes));
    const row = await prisma.gzBooking.findUnique({ where: { code: "GZ-OVER" } });
    assert.equal(row?.total, 300 + r.body.data.extraCharge);
    assert.equal(row?.status, "completed");
    const paid = await api.post("/gamezone/bookings/GZ-OVER/mark-paid", fd.auth);
    assert.equal(paid.status, 200);
    assert.equal((await prisma.gzBooking.findUnique({ where: { code: "GZ-OVER" } }))?.paymentStatus, "paid");
  });

  it("a session paid before it ran over only owes the extra", async () => {
    const fd = await staff("frontdesk");
    await session("GZ-PRE");
    assert.equal((await api.post("/gamezone/bookings/GZ-PRE/mark-paid", fd.auth, { payments: [{ method: "cash", amount: 300 }] })).status, 200);
    await api.post("/gamezone/bookings/GZ-PRE/start", fd.auth);
    await ranFor("GZ-PRE", 70); // 10 minutes over
    const r = await api.post("/gamezone/bookings/GZ-PRE/complete", fd.auth);
    const { extraCharge } = r.body.data;
    assert.ok(extraCharge >= 50 && extraCharge <= 55);
    const row = await prisma.gzBooking.findUnique({ where: { code: "GZ-PRE" } });
    assert.equal(row?.paymentStatus, "pay_at_venue"); // the extra is still to collect
    assert.equal(row?.total, 300 + extraCharge);
    const day = (await api.get(`/gamezone/day?date=${today}`, fd.auth)).body.data;
    assert.equal(day.items.find((i: { code: string }) => i.code === "GZ-PRE").due, extraCharge); // only the extra
    assert.equal((await api.post("/gamezone/bookings/GZ-PRE/mark-paid", fd.auth, { payments: [{ method: "cash", amount: 300 + extraCharge }] })).status, 400); // not the whole total again
    assert.equal((await api.post("/gamezone/bookings/GZ-PRE/mark-paid", fd.auth, { payments: [{ method: "cash", amount: extraCharge }] })).status, 200);
    assert.equal((await prisma.gzBooking.findUnique({ where: { code: "GZ-PRE" } }))?.paymentStatus, "paid");
  });

  it("a session that was never started still completes as before", async () => {
    const fd = await staff("frontdesk");
    await session("GZ-PLAIN");
    const r = await api.post("/gamezone/bookings/GZ-PLAIN/complete", fd.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.extraCharge, 0);
  });
});
