import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, paidQr, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const game = (userId: string | null, extra: object = {}) =>
  prisma.booking.create({ data: { userId, customerName: "Team Alpha", customerPhone: userId, date: today, startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending", ...extra } });

async function shop(mgr: { auth: Record<string, string> }) {
  const cat = (await api.post("/inventory/categories", mgr.auth, { name: "Drinks" })).body.data;
  return (await api.post("/inventory/products", mgr.auth, { name: "Mineral water", price: 40, costPrice: 25, categoryId: cat.id, openingStock: 50 })).body.data;
}

describe("Inventory report", () => {
  it("adds up cash and Fonepay once across games, goods and Gamezone", async () => {
    const mgr = await staff("admin");
    await customer("9860000001", "Raju Rai");
    const water = await shop(mgr);
    await game("9860000001", { paymentStatus: "completed", cashAmount: 1500, promoCode: "TIHAR20", discountAmount: 300 });
    await game(null, { startTime: "19:00", endTime: "20:00", paymentStatus: "completed", paymentMethod: "fonepay", onlineAmount: 1500, customerName: "Guest Team" });
    await game(null, { startTime: "20:00", endTime: "21:00", paymentStatus: "pending" }); // unpaid: listed, not counted
    await prisma.booking.create({ data: { userId: "9860000001", date: today, startTime: "07:00", endTime: "08:00", duration: 1, basePrice: 3000, subtotal: 3000, totalPrice: 3000, paymentMethod: "venue", status: "confirmed", paymentStatus: "completed", cashAmount: 3000, notes: "MEMBERSHIP_PAYMENT: Premium" } });
    await api.post("/inventory/sales", mgr.auth, { phone: "9860000001", payment: "cash", items: [{ productId: water.id, quantity: 5 }] }); // Rs. 200 cash goods
    await prisma.gzBooking.create({ data: { code: "GZ-1", userId: "9860000001", consoleId: "c1", gameTitle: "FIFA 26", date: today, startHour: 15, hours: 3, players: 2, total: 1200, paymentMethod: "venue", paymentStatus: "paid", status: "completed" } });
    await prisma.gzBooking.create({ data: { code: "GZ-2", guestName: "Walk Guest", consoleId: "c1", gameTitle: "FIFA 26", date: today, startHour: 18, hours: 1, players: 1, total: 300, paymentMethod: "fonepay", paymentStatus: "paid", status: "completed" } });

    const r = (await api.get(`/inventory/report?from=${today}&to=${today}`, mgr.auth)).body.data;
    assert.equal(r.totals.cash, 1500 + 200 + 1200);
    assert.equal(r.totals.fonepay, 1500 + 300);
    assert.equal(r.totals.total, 4700);
    assert.deepEqual(r.totals.bySource.games, { cash: 1500, fonepay: 1500 });
    assert.equal(r.games.count, 3, "the membership ledger row is not a game");
    assert.equal(r.games.paidCount, 2);
    assert.equal(r.games.items.find((g: { promoCode: string | null }) => g.promoCode)?.promoCode, "TIHAR20");
    assert.equal(r.gamezone.items[0].extraHours, 2);
    assert.equal(r.gamezone.items[0].customer, "Raju Rai");
    assert.equal(r.memberships.count, 0, "memberships come from subscriptions, not the ledger");
    assert.deepEqual(r.itemsSold, [{ name: "Mineral water", qty: 5, amount: 200 }]);
    assert.equal(r.purchases.customers[0].name, "Raju Rai");
    assert.equal(r.purchases.customers[0].sales[0].items[0].qty, 5);
    assert.equal(r.purchases.customers[0].sales[0].payment, "Cash");
  });

  it("counts a bill once (games, goods and a Fonepay part), and goods on credit only when they are paid", async () => {
    const mgr = await staff("admin");
    await customer("9860000002", "Sita Shah");
    const water = await shop(mgr);
    const g = await game("9860000002");
    // goods on credit: stock goes, no money yet
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: "9860000002", payment: "due", items: [{ productId: water.id, quantity: 10 }] })).status, 201);
    let r = (await api.get(`/inventory/report?from=${today}`, mgr.auth)).body.data;
    assert.equal(r.totals.total, 0);
    assert.equal(r.purchases.customers[0].sales[0].payment, "On credit");
    assert.equal(r.itemsSold[0].qty, 10);
    // pay the game and the credit goods together: Rs. 1500 + Rs. 400, Rs. 900 cash and Rs. 1000 Fonepay
    const due = await prisma.goodsDue.findFirstOrThrow();
    const qr = await paidQr(mgr.auth, 1000);
    const paid = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], goodsDueIds: [due.id], payments: [{ method: "cash", amount: 900 }, { method: "fonepay", amount: 1000 }], fonepayQrId: qr });
    assert.equal(paid.status, 200);
    r = (await api.get(`/inventory/report?from=${today}`, mgr.auth)).body.data;
    assert.equal(r.totals.total, 1900, "each rupee once, though a bill and the sources both record it");
    assert.equal(r.totals.cash, 900);
    assert.equal(r.totals.fonepay, 1000);
    assert.equal(r.purchases.customers[0].sales[0].payment, "Paid later");
  });

  it("filters by day and range, lists memberships, and checks the dates", async () => {
    const mgr = await staff("admin");
    await customer("9860000003", "Mina Member");
    const old = addDaysKey(today, -1);
    await game(null, { date: old, paymentStatus: "completed", cashAmount: 1500 });
    const plan = await prisma.membershipPlan.create({ data: { name: "Premium", price: 2000, perks: "[]" } });
    await prisma.membershipSubscription.create({ data: { planId: plan.id, userId: "9860000003", startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${addDaysKey(today, 30)}T00:00:00Z`), status: "active", paymentStatus: "verified", paymentVerifiedAt: new Date(), timeSlot: "07:00-08:00", chosenDuration: "1_month", totalPrice: 3000, chosenDays: ["Monday"], memberCode: "MEM-10001" } });
    assert.equal((await api.get(`/inventory/report?from=${today}&to=${today}`, mgr.auth)).body.data.totals.total, 0);
    assert.equal((await api.get(`/inventory/report?from=${old}&to=${old}`, mgr.auth)).body.data.totals.cash, 1500);
    const both = (await api.get(`/inventory/report?from=${old}&to=${today}`, mgr.auth)).body.data;
    assert.equal(both.totals.cash, 1500);
    assert.equal(both.memberships.items[0].memberCode, "MEM-10001");
    assert.equal(both.memberships.amount, 3000);
    assert.equal((await api.get(`/inventory/report?from=${today}&to=${old}`, mgr.auth)).status, 400);
    assert.equal((await api.get(`/inventory/report?from=${addDaysKey(today, -200)}&to=${today}`, mgr.auth)).status, 400);
  });

  it("feeds the Overview page: today and yesterday money, a week, what needs attention", async () => {
    const mgr = await staff("admin");
    await game(null, { paymentStatus: "completed", cashAmount: 1500 });
    await game(null, { startTime: "21:00", endTime: "22:00" }); // unpaid
    await game(null, { date: addDaysKey(today, -1), paymentStatus: "completed", paymentMethod: "fonepay", onlineAmount: 900 });
    const r = await api.get("/overview", mgr.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.today.cash, 1500);
    assert.equal(r.body.data.yesterday.fonepay, 900);
    assert.equal(r.body.data.week.length, 7);
    assert.equal(r.body.data.week[6].date, today);
    assert.equal(r.body.data.attention.unpaidGamesToday, 1);
    assert.equal(r.body.data.games.count, 2);
  });
});
