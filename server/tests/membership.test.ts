import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, paidQr, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const plan = (extra: object = {}) =>
  prisma.membershipPlan.create({
    data: { name: "Premium", price: 2000, perks: "[]", isActive: true, price1MonthMorning: 3000, price3MonthsMorning: 8000, discount3MonthsMorning: 500, price6MonthsMorning: 15000, price1MonthDay: 2500, price1MonthEvening: null, ...extra },
  });
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const body = (planId: string, extra: object = {}) => ({ phone: "9840000001", planId, length: "1_month", timeSlot: "07:00-08:00", days: WEEK, startDate: today, ...extra });

describe("Membership subscriptions", () => {
  it("makes a pending membership with a Membership ID, priced from the plan, and holds the hour", async () => {
    await customer("9840000001", "Mina Member");
    const mgr = await staff("manager");
    const p = await plan();
    const r = await api.post("/membership/subscriptions", mgr.auth, body(p.id));
    assert.equal(r.status, 201);
    assert.match(r.body.data.memberCode, /^MEM-\d{5}$/);
    assert.equal(r.body.data.status, "pending");
    assert.equal(r.body.data.totalPrice, 3000);
    assert.equal(r.body.data.shift, "morning");
    assert.equal(r.body.data.endDate, addDaysKey(today, 30));
    // the second membership gets the next number
    await customer("9840000002", "Second");
    const r2 = await api.post("/membership/subscriptions", mgr.auth, body(p.id, { phone: "9840000002", timeSlot: "08:00-09:00" }));
    assert.equal(Number(r2.body.data.memberCode.slice(4)), Number(r.body.data.memberCode.slice(4)) + 1);
  });

  it("refuses 4 PM to 8 PM, a price the plan does not offer, unknown customers, past dates and a second membership", async () => {
    await customer("9840000001");
    const mgr = await staff("manager");
    const p = await plan();
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { timeSlot: "18:00-19:00" }))).status, 409);
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { timeSlot: "21:00-22:00" }))).status, 409); // evening not offered
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { phone: "9840009999" }))).status, 404);
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { startDate: addDaysKey(today, -1) }))).status, 400);
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id))).status, 201);
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { timeSlot: "08:00-09:00" }))).status, 409);
  });

  it("holds the hour: staff cannot book it for someone else, but the grid shows who holds it", async () => {
    await customer("9840000001", "Mina Member");
    const mgr = await staff("manager");
    const p = await plan();
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id))).status, 201);
    const walk = await api.post("/bookings/walk-in", mgr.auth, { date: addDaysKey(today, 1), startTime: "07:00", duration: 1, customerName: "Other Team", paymentMethod: "venue", paid: false });
    assert.equal(walk.status, 409);
    assert.match(walk.body.message, /held for member Mina Member/);
    const day = await api.get(`/courts/slots?date=${addDaysKey(today, 1)}`, mgr.auth);
    assert.equal(day.body.data.hours[7].member.name, "Mina Member");
    // a second membership cannot take the same hour, and bulk booking skips the held dates
    await customer("9840000003");
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { phone: "9840000003" }))).status, 409);
    const bulk = await api.post("/bookings/walk-in/bulk", mgr.auth, { dates: [addDaysKey(today, 1), addDaysKey(today, 2)], startTime: "07:00", duration: 1, customerName: "Other", mode: "free", dryRun: true });
    assert.equal(bulk.body.data.free, 0);
  });

  it("holds only the chosen weekdays", async () => {
    await customer("9840000001", "Mina Member");
    const mgr = await staff("manager");
    const p = await plan();
    const day = new Date(`${addDaysKey(today, 1)}T00:00:00Z`).getUTCDay();
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const other = names[(day + 1) % 7]; // not tomorrow
    assert.equal((await api.post("/membership/subscriptions", mgr.auth, body(p.id, { days: [other] }))).status, 201);
    const walk = await api.post("/bookings/walk-in", mgr.auth, { date: addDaysKey(today, 1), startTime: "07:00", duration: 1, customerName: "Other Team", paymentMethod: "venue", paid: false });
    assert.equal(walk.status, 201);
  });

  it("verifies a payment: activates, adds a ledger row, awards points for 3 months, and cannot be verified twice", async () => {
    await customer("9840000001");
    const mgr = await staff("manager");
    const p = await plan();
    const made = await api.post("/membership/subscriptions", mgr.auth, body(p.id, { length: "3_months" }));
    assert.equal(made.body.data.totalPrice, 7500); // 8000 - 500 discount
    const id = made.body.data.id;
    const v = await api.post(`/membership/subscriptions/${id}/verify`, mgr.auth, { single: "cash" });
    assert.equal(v.status, 200);
    assert.equal(v.body.data.status, "active");
    assert.equal(v.body.data.pointsAdded, 30);
    const ledger = await prisma.booking.findMany({ where: { notes: { contains: `MEMBERSHIP_SUB:${id}` } } });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].cashAmount, 7500);
    assert.equal((await api.post(`/membership/subscriptions/${id}/verify`, mgr.auth, { single: "cash" })).status, 409);
    assert.equal(await prisma.notification.count({ where: { userId: "9840000001", type: "membership" } }), 1);
  });

  it("verifies with cash plus a paid Fonepay QR; a Fonepay part without a paid QR is refused", async () => {
    await customer("9840000001");
    const mgr = await staff("manager");
    const p = await plan();
    const made = await api.post("/membership/subscriptions", mgr.auth, body(p.id));
    const id = made.body.data.id;
    const bad = await api.post(`/membership/subscriptions/${id}/verify`, mgr.auth, { payments: [{ method: "cash", amount: 1000 }, { method: "fonepay", amount: 2000 }] });
    assert.equal(bad.status, 400);
    const qr = await paidQr(mgr.auth, 2000);
    const ok = await api.post(`/membership/subscriptions/${id}/verify`, mgr.auth, { payments: [{ method: "cash", amount: 1000 }, { method: "fonepay", amount: 2000 }], fonepayQrId: qr });
    assert.equal(ok.status, 200);
    const row = (await prisma.booking.findMany({ where: { notes: { contains: `MEMBERSHIP_SUB:${id}` } } }))[0];
    assert.equal(row.cashAmount, 1000);
    assert.equal(row.onlineAmount, 2000);
  });

  it("creates and activates in one step when paid at once", async () => {
    await customer("9840000001");
    const mgr = await staff("manager");
    const p = await plan();
    const r = await api.post("/membership/subscriptions", mgr.auth, body(p.id, { length: "6_months", pay: { single: "cash" } }));
    assert.equal(r.status, 201);
    assert.equal(r.body.data.status, "active");
    assert.equal(r.body.data.pointsAdded, 70);
    assert.equal(r.body.data.endDate, addDaysKey(today, 180));
  });

  it("renews from the end date (paid now), extends, suspends, resumes and cancels", async () => {
    await customer("9840000001");
    const mgr = await staff("manager");
    const p = await plan();
    const made = await api.post("/membership/subscriptions", mgr.auth, body(p.id, { pay: { single: "cash" } }));
    const id = made.body.data.id;
    assert.equal((await api.post(`/membership/subscriptions/${id}/renew`, mgr.auth, {})).status, 400); // payment is required
    const renewed = await api.post(`/membership/subscriptions/${id}/renew`, mgr.auth, { length: "3_months", pay: { single: "cash" } });
    assert.equal(renewed.status, 200);
    assert.equal(renewed.body.data.endDate, addDaysKey(addDaysKey(today, 30), 90));
    assert.equal(renewed.body.data.pointsAdded, 30);
    const ext = await api.post(`/membership/subscriptions/${id}/extend`, mgr.auth, { days: 7, reason: "Tournament week" });
    assert.equal(ext.body.data.endDate, addDaysKey(renewed.body.data.endDate, 7));
    assert.equal((await api.post(`/membership/subscriptions/${id}/suspend`, mgr.auth, {})).status, 400); // a reason is needed
    assert.equal((await api.post(`/membership/subscriptions/${id}/suspend`, mgr.auth, { reason: "Unpaid balance" })).body.data.status, "suspended");
    // while suspended the hour is free for others
    const walk = await api.post("/bookings/walk-in", mgr.auth, { date: addDaysKey(today, 1), startTime: "07:00", duration: 1, customerName: "Other", paymentMethod: "venue", paid: false });
    assert.equal(walk.status, 201);
    // resuming is refused where the hour has been taken since
    assert.equal((await api.post(`/membership/subscriptions/${id}/resume`, mgr.auth, {})).status, 409);
    await prisma.bookingSlot.deleteMany();
    assert.equal((await api.post(`/membership/subscriptions/${id}/resume`, mgr.auth, {})).body.data.status, "active");
    assert.equal((await api.post(`/membership/subscriptions/${id}/cancel`, mgr.auth, { reason: "Moved away" })).body.data.status, "cancelled");
  });

  it("shows Expiring soon and Expired, sends the notices once, and filters and counts by status", async () => {
    await customer("9840000001", "Expiring One");
    await customer("9840000002", "Expired Two");
    await customer("9840000003", "Fine Three");
    const mgr = await staff("manager");
    const p = await plan();
    const mk = (phone: string, code: string, start: string, end: string, slot: string) =>
      prisma.membershipSubscription.create({ data: { planId: p.id, userId: phone, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`), status: "active", paymentStatus: "verified", timeSlot: slot, chosenDuration: "1_month", totalPrice: 3000, chosenDays: WEEK, memberCode: code } });
    await mk("9840000001", "MEM-10001", addDaysKey(today, -20), addDaysKey(today, 10), "07:00-08:00");
    await mk("9840000002", "MEM-10002", addDaysKey(today, -40), addDaysKey(today, -5), "08:00-09:00");
    await mk("9840000003", "MEM-10003", today, addDaysKey(today, 60), "09:00-10:00");
    const all = await api.get("/membership/subscriptions", mgr.auth);
    assert.deepEqual([all.body.data.counts.expiring, all.body.data.counts.expired, all.body.data.counts.active], [1, 1, 1]);
    assert.equal(all.body.data.items.length, 3);
    await api.get("/membership/subscriptions", mgr.auth); // again: no second notice
    const titles = (await prisma.notification.findMany({ where: { type: "membership" }, orderBy: { title: "asc" } })).map((n) => n.title);
    assert.deepEqual(titles, ["Membership expired", "Membership expiring soon"]);
    const exp = await api.get("/membership/subscriptions?status=expired", mgr.auth);
    assert.deepEqual(exp.body.data.items.map((x: { memberCode: string }) => x.memberCode), ["MEM-10002"]);
    const found = await api.get("/membership/subscriptions?q=MEM-10003", mgr.auth);
    assert.equal(found.body.data.items[0].customer.name, "Fine Three");
    // an expired membership can be renewed from today
    const renew = await api.post(`/membership/subscriptions/${exp.body.data.items[0].id}/renew`, mgr.auth, { pay: { single: "cash" } });
    assert.equal(renew.status, 200);
    assert.equal(renew.body.data.endDate, addDaysKey(today, 30));
  });

  it("is staff-only and needs the right permission", async () => {
    const r = await api.get("/membership/subscriptions", {});
    assert.equal(r.status, 401);
    await customer("9840000001");
    const desk = await staff("frontdesk");
    assert.equal((await api.get("/membership/subscriptions", desk.auth)).status, 200);
    const p = await plan();
    assert.equal((await api.post("/membership/subscriptions", desk.auth, body(p.id))).status, 403);
  });
});
