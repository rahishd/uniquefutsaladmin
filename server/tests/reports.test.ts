import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const game = (extra: object = {}) =>
  prisma.booking.create({ data: { userId: null, customerName: "Team Alpha", customerPhone: null, date: today, startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending", ...extra } });

describe("Reports summary", () => {
  it("adds up cash and Fonepay by day across games, goods and Gamezone, once, and compares with the period before", async () => {
    const mgr = await staff("admin");
    const yesterday = addDaysKey(today, -1);
    await game({ paymentStatus: "completed", cashAmount: 1500, promoCode: "TIHAR20", discountAmount: 300 });
    await game({ startTime: "19:00", endTime: "20:00", paymentStatus: "completed", paymentMethod: "fonepay", onlineAmount: 1500 });
    await game({ startTime: "20:00", endTime: "21:00" }); // unpaid
    await game({ date: yesterday, paymentStatus: "completed", cashAmount: 1000, totalPrice: 1000 });
    await game({ date: addDaysKey(today, -3), paymentStatus: "completed", cashAmount: 700, totalPrice: 700 }); // in the earlier period
    await prisma.booking.create({ data: { userId: null, date: today, startTime: "07:00", endTime: "08:00", duration: 1, basePrice: 3000, subtotal: 3000, totalPrice: 3000, paymentMethod: "venue", status: "confirmed", paymentStatus: "completed", cashAmount: 3000, notes: "MEMBERSHIP_PAYMENT: Premium" } }); // not a game, not sales
    await prisma.gzBooking.create({ data: { code: "GZ-1", guestName: "Walk", consoleId: "c1", gameTitle: "FIFA", date: today, startHour: 15, hours: 1, players: 1, total: 300, paymentMethod: "fonepay", paymentStatus: "paid", status: "completed" } });
    const cat = (await api.post("/inventory/categories", mgr.auth, { name: "Drinks" })).body.data;
    const water = (await api.post("/inventory/products", mgr.auth, { name: "Water", price: 40, costPrice: 25, categoryId: cat.id, openingStock: 50 })).body.data;
    await api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: water.id, quantity: 5 }] }); // Rs. 200 cash

    const r = (await api.get(`/reports/summary?from=${yesterday}&to=${today}`, mgr.auth)).body.data;
    assert.equal(r.days, 2);
    assert.deepEqual([r.totals.cash, r.totals.fonepay, r.totals.total], [1500 + 1000 + 200, 1500 + 300, 4500]);
    assert.deepEqual([r.totals.games, r.totals.goods, r.totals.gamezone], [4000, 200, 300]);
    assert.equal(r.byDay.length, 2);
    assert.equal(r.byDay[1].date, today);
    assert.equal(r.byDay[1].total, 3500);
    assert.equal(r.previous.total, 700, "the two days before");
    assert.equal(r.games.count, 4);
    assert.deepEqual([r.games.paid, r.games.unpaid, r.games.unpaidAmount], [3, 1, 1500]);
    assert.deepEqual(r.promos, [{ code: "TIHAR20", uses: 1, discount: 300 }]);
    assert.equal(r.topCustomers[0].name, "Team Alpha");
    assert.equal(r.topCustomers[0].spent, 4000);
  });

  it("shows when people play, how they booked, no-shows and cancellations", async () => {
    const mgr = await staff("admin");
    await game({ startTime: "18:00", endTime: "20:00", duration: 2, notes: "WALK_IN" });
    await game({ startTime: "19:00", endTime: "20:00" });
    await game({ startTime: "10:00", endTime: "11:00", source: "challenge" });
    await game({ status: "cancelled" });
    await game({ status: "no_show", startTime: "12:00", endTime: "13:00" });
    const r = (await api.get(`/reports/summary?from=${today}&to=${today}`, mgr.auth)).body.data;
    assert.deepEqual(r.games.source, { app: 1, staff: 1, challenge: 1 });
    assert.equal(r.games.cancelled, 1);
    assert.equal(r.games.noShows, 1);
    assert.equal(r.occupancy.bookedHours, 4, "2 + 1 + 1 hours; the cancelled and no-show games are not counted");
    assert.deepEqual(r.occupancy.peakHours[0], { hour: 19, games: 2 });
    assert.equal(r.occupancy.weekdays.reduce((t: number, w: { hours: number }) => t + w.hours, 0), 4);
  });

  it("reports memberships and loyalty standing numbers", async () => {
    const mgr = await staff("admin");
    await customer("9870000001");
    const plan = await prisma.membershipPlan.create({ data: { name: "Premium", price: 2000, perks: "[]" } });
    const mk = (status: string, endIn: number) => prisma.membershipSubscription.create({ data: { planId: plan.id, userId: "9870000001", startDate: new Date(`${addDaysKey(today, -20)}T00:00:00Z`), endDate: new Date(`${addDaysKey(today, endIn)}T00:00:00Z`), status, paymentStatus: "verified", totalPrice: 3000, chosenDays: [] } });
    await mk("active", 10);
    await mk("active", 60);
    await mk("pending", 60);
    const r = (await api.get("/reports/summary", mgr.auth)).body.data;
    assert.deepEqual([r.memberships.active, r.memberships.expiringSoon, r.memberships.waitingForPayment, r.memberships.activeValue], [2, 1, 1, 6000]);
    assert.equal(r.days, 30, "the default is the last 30 days");
  });

  it("checks the dates and needs the reports permission", async () => {
    const mgr = await staff("admin");
    assert.equal((await api.get(`/reports/summary?from=${today}&to=${addDaysKey(today, -1)}`, mgr.auth)).status, 400);
    assert.equal((await api.get(`/reports/summary?from=${addDaysKey(today, -200)}&to=${today}`, mgr.auth)).status, 400);
    assert.equal((await api.get(`/reports/summary?to=${addDaysKey(today, 2)}`, mgr.auth)).status, 400);
    assert.equal((await api.get("/reports/summary", {})).status, 401);
    const desk = await staff("frontdesk");
    assert.equal((await api.get("/reports/summary", desk.auth)).status, 403);
  });
});
