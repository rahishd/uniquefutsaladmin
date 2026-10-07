import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, paidQr, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
const d1 = addDaysKey(today, 1);
const d2 = addDaysKey(today, 2);
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const event = (extra: object = {}) => ({ name: "Tuna Cup", hostName: "Anil Gurung", hostPhone: "9841000000", minRate: 2000, days: [{ date: d1, startHour: 5, endHour: 8 }, { date: d2, startHour: 10, endHour: 15 }], ...extra });
async function shop(mgr: { auth: Record<string, string> }) {
  const cat = (await api.post("/inventory/categories", mgr.auth, { name: "Drinks" })).body.data;
  return (await api.post("/inventory/products", mgr.auth, { name: "Water", price: 40, costPrice: 25, categoryId: cat.id, openingStock: 100 })).body.data;
}

describe("Hosted tournaments", () => {
  it("registers an event for chosen days and hours, holds the court, and prices it by the hour", async () => {
    const mgr = await staff("admin");
    const r = await api.post("/tournaments", mgr.auth, event());
    assert.equal(r.status, 201);
    assert.equal(r.body.data.hours, 8, "3 hours + 5 hours");
    assert.equal(r.body.data.court, 16000);
    assert.equal(r.body.data.total, 16000);
    assert.deepEqual(r.body.data.days.map((d: { date: string; hours: number }) => [d.date, d.hours]), [[d1, 3], [d2, 5]]);
    assert.equal(await prisma.bookingSlot.count({ where: { date: d1, bookingId: { startsWith: "block:" } } }), 3);
    assert.equal(await prisma.slotBlock.count({ where: { reason: "Tournament: Tuna Cup" } }), 8);
    const t = await prisma.tournament.findFirstOrThrow();
    assert.deepEqual([t.hostedEvent, t.hostName, t.minRate, t.startDate, t.endDate], [true, "Anil Gurung", 2000, d1, d2]);
    // the hours cannot be booked by staff any more
    const walk = await api.post("/bookings/walk-in", mgr.auth, { date: d1, startTime: "06:00", duration: 1, customerName: "Other", paymentMethod: "venue", paid: false });
    assert.equal(walk.status, 409);
    const list = (await api.get("/tournaments/hosted", mgr.auth)).body.data;
    assert.deepEqual([list.length, list[0].hostName, list[0].total, list[0].due], [1, "Anil Gurung", 16000, 16000]);
  });

  it("checks the hours first (dryRun) and refuses days that clash with a booking, a member or a past time", async () => {
    const mgr = await staff("admin");
    await customer("9842000001", "Raju");
    const b = await prisma.booking.create({ data: { userId: "9842000001", customerName: "Raju", date: d1, startTime: "06:00", endTime: "07:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending", code: "UF-CLASH1" } });
    await prisma.bookingSlot.create({ data: { date: d1, hour: 6, bookingId: b.id } });
    const dry = await api.post("/tournaments", mgr.auth, event({ dryRun: true }));
    assert.equal(dry.status, 200);
    assert.equal(dry.body.data.clashes.length, 1);
    assert.match(dry.body.data.clashes[0].reason, /UF-CLASH1/);
    assert.equal(await prisma.tournament.count(), 0, "a dry run saves nothing");
    assert.equal((await api.post("/tournaments", mgr.auth, event())).status, 409);
    assert.equal((await api.post("/tournaments", mgr.auth, event({ days: [{ date: d1, startHour: 8, endHour: 9 }, { date: d1, startHour: 10, endHour: 11 }] }))).status, 400, "one range per day");
    assert.equal((await api.post("/tournaments", mgr.auth, event({ days: [{ date: addDaysKey(today, -1), startHour: 8, endHour: 9 }] }))).status, 400);
    assert.equal((await api.post("/tournaments", mgr.auth, event({ days: [{ date: d1, startHour: 9, endHour: 9 }] }))).status, 400);
    assert.equal((await api.post("/tournaments", mgr.auth, event({ minRate: 50 }))).status, 400);
    assert.equal((await api.post("/tournaments", mgr.auth, event({ hostPhone: "abc" }))).status, 400);
    // a member holds the 12:00 hour on that day
    await customer("9842000002", "Member");
    const plan = await prisma.membershipPlan.create({ data: { name: "Premium", price: 2000, perks: "[]" } });
    await prisma.membershipSubscription.create({ data: { planId: plan.id, userId: "9842000002", startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${addDaysKey(today, 30)}T00:00:00Z`), status: "active", paymentStatus: "verified", timeSlot: "12:00-13:00", chosenDays: [], chosenDuration: "1_month" } });
    const m = await api.post("/tournaments", mgr.auth, event({ days: [{ date: d2, startHour: 11, endHour: 14 }], dryRun: true }));
    assert.match(m.body.data.clashes[0].reason, /held for member/);
  });

  it("adds goods from the shop during the event, extra charges and a discount, and the bill adds up", async () => {
    const mgr = await staff("admin");
    const water = await shop(mgr);
    const id = (await api.post("/tournaments", mgr.auth, event())).body.data.id;
    assert.equal((await api.post(`/tournaments/${id}/items`, mgr.auth, { items: [{ productId: water.id, quantity: 30 }] })).status, 201);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: water.id } })).inventory, 70);
    const log = await prisma.inventoryLog.findFirstOrThrow({ where: { reason: `Tournament #${id}` } });
    assert.deepEqual([log.change, log.cashAmount, log.onlineAmount], [-30, 0, 0], "the shop sales do not count it: the money is the tournament payments");
    assert.equal((await api.post(`/tournaments/${id}/items`, mgr.auth, { items: [{ productId: water.id, quantity: 500 }] })).status, 409, "not enough stock");
    await api.post(`/tournaments/${id}/lines`, mgr.auth, { kind: "extra", label: "Referee", amount: 1500 });
    await api.post(`/tournaments/${id}/lines`, mgr.auth, { kind: "discount", label: "Friend of the venue", amount: 700 });
    const b = (await api.get(`/tournaments/${id}/billing`, mgr.auth)).body.data;
    assert.deepEqual([b.court, b.goods, b.extras, b.discount, b.total], [16000, 1200, 1500, 700, 18000]);
    assert.equal((await api.post(`/tournaments/${id}/lines`, mgr.auth, { kind: "discount", label: "Too much", amount: 50000 })).status, 400);
    // removing the goods gives the stock back
    const goodsLine = b.lines.find((l: { kind: string }) => l.kind === "goods");
    await api.del(`/tournaments/${id}/lines/${goodsLine.id}`, mgr.auth);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: water.id } })).inventory, 100);
    assert.equal((await api.get(`/tournaments/${id}/billing`, mgr.auth)).body.data.total, 16800);
    // a new rate re-prices the court
    assert.equal((await api.patch(`/tournaments/${id}/rate`, mgr.auth, { minRate: 2500 })).body.data.court, 20000);
  });

  it("receives payments in cash and with a paid Fonepay QR, never more than is due, and tracks paid and due", async () => {
    const mgr = await staff("admin");
    const id = (await api.post("/tournaments", mgr.auth, event())).body.data.id; // Rs. 16,000
    assert.equal((await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 5000, single: "cash", note: "Advance" })).body.data.due, 11000);
    assert.equal((await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 20000, single: "cash" })).status, 409, "more than is due");
    const bad = await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 6000, payments: [{ method: "cash", amount: 1000 }, { method: "fonepay", amount: 5000 }] });
    assert.equal(bad.status, 400, "a Fonepay part needs a paid QR");
    const qr = await paidQr(mgr.auth, 5000);
    const ok = await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 6000, payments: [{ method: "cash", amount: 1000 }, { method: "fonepay", amount: 5000 }], fonepayQrId: qr });
    assert.equal(ok.status, 201);
    assert.deepEqual([ok.body.data.paid, ok.body.data.paidCash, ok.body.data.paidFonepay, ok.body.data.due], [11000, 6000, 5000, 5000]);
    assert.equal((await prisma.tournament.findFirstOrThrow()).paymentStatus, "partial");
    await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 5000, single: "cash" });
    assert.equal((await prisma.tournament.findFirstOrThrow()).paymentStatus, "paid");
    assert.equal((await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 100, single: "cash" })).status, 409, "nothing left to pay");
  });

  it("makes the final bill, which locks the bill until it is reopened; and cancels only an event with no money or goods", async () => {
    const mgr = await staff("admin");
    const water = await shop(mgr);
    const a = (await api.post("/tournaments", mgr.auth, event())).body.data.id;
    assert.equal((await api.post(`/tournaments/${a}/final-bill`, mgr.auth)).body.data.closedAt !== null, true);
    assert.equal((await api.post(`/tournaments/${a}/lines`, mgr.auth, { kind: "extra", label: "Late", amount: 100 })).status, 409, "locked");
    assert.equal((await api.post(`/tournaments/${a}/final-bill`, mgr.auth)).status, 409);
    assert.equal((await api.post(`/tournaments/${a}/reopen-bill`, mgr.auth)).body.data.closedAt, null);
    assert.equal((await api.post(`/tournaments/${a}/lines`, mgr.auth, { kind: "extra", label: "Late", amount: 100 })).status, 201);
    // cancel: frees the court hours
    const c = (await api.post("/tournaments", mgr.auth, event({ name: "Second", days: [{ date: addDaysKey(today, 5), startHour: 6, endHour: 8 }] }))).body.data.id;
    assert.equal(await prisma.bookingSlot.count({ where: { date: addDaysKey(today, 5) } }), 2);
    assert.equal((await api.post(`/tournaments/${c}/cancel`, mgr.auth)).status, 200);
    assert.equal(await prisma.bookingSlot.count({ where: { date: addDaysKey(today, 5) } }), 0);
    assert.equal((await api.get("/tournaments/hosted", mgr.auth)).body.data.length, 1, "the cancelled one is gone");
    // with goods on the bill it cannot be cancelled
    await api.post(`/tournaments/${a}/items`, mgr.auth, { items: [{ productId: water.id, quantity: 2 }] });
    assert.equal((await api.post(`/tournaments/${a}/cancel`, mgr.auth)).status, 409);
  });

  it("is limited by permission", async () => {
    const desk = await staff("frontdesk");
    assert.equal((await api.post("/tournaments", desk.auth, event())).status, 403);
    assert.equal((await api.get("/tournaments/hosted", {})).status, 401);
  });

  it("counts the money received in the reports, once, with goods taken during the event not added a second time", async () => {
    const mgr = await staff("admin");
    const water = await shop(mgr);
    const id = (await api.post("/tournaments", mgr.auth, event())).body.data.id; // Rs. 16,000
    await api.post(`/tournaments/${id}/items`, mgr.auth, { items: [{ productId: water.id, quantity: 10 }] }); // Rs. 400 on the bill, no cash yet
    await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 5000, single: "cash" });
    const qr = await paidQr(mgr.auth, 2000);
    await api.post(`/tournaments/${id}/payments`, mgr.auth, { amount: 2000, payments: [{ method: "fonepay", amount: 2000 }], fonepayQrId: qr });
    const r = (await api.get(`/inventory/report?from=${today}&to=${d1}`, mgr.auth)).body.data; // the days of the event are ahead, the money was received today
    assert.deepEqual([r.totals.cash, r.totals.fonepay, r.totals.total], [5000, 2000, 7000], "only the payments received, not the 400 of goods");
    assert.deepEqual(r.totals.bySource.tournaments, { cash: 5000, fonepay: 2000 });
    assert.equal(r.totals.bySource.goods.cash + r.totals.bySource.goods.fonepay, 0);
    const t = r.tournaments.items.find((x: { id: string }) => x.id === id);
    assert.deepEqual([t.hosted, t.amount, t.received, t.due], [true, 16400, 7000, 9400]);
    const s = (await api.get(`/reports/summary?from=${today}&to=${today}`, mgr.auth)).body.data;
    assert.deepEqual([s.totals.tournaments, s.totals.total], [7000, 7000]);
  });
});
