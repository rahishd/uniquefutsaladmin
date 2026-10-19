import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const booking = (extra: object = {}) =>
  prisma.booking.create({ data: { userId: "9880000001", customerName: "Raju", date: today, startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "fonepay", status: "confirmed", paymentStatus: "pending", ...extra } });

describe("Admin activity feed", () => {
  it("shows what customers just did, newest first, and leaves out what staff did themselves", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    await booking();
    await booking({ startTime: "19:00", endTime: "20:00", notes: "WALK_IN" }); // made by staff: not news
    await booking({ startTime: "20:00", endTime: "21:00", notes: "MEMBERSHIP_PAYMENT: Premium", paymentMethod: "venue" }); // ledger row
    await prisma.complaint.create({ data: { code: "CP-1", userId: "9880000001", category: "Court", message: "The floor is wet" } });
    await prisma.paymentOrder.create({ data: { orderCode: "UF-X", purpose: "game", userId: "9880000001", method: "fonepay", amount: 1500, status: "paid", remarks: "x", expiresAt: new Date(Date.now() + 60_000), paidAt: new Date() } });
    const r = (await api.get("/activity", owner.auth)).body.data;
    const titles = r.items.map((i: { title: string }) => i.title);
    assert.ok(titles.includes("New booking"));
    assert.ok(titles.includes("New complaint"));
    assert.ok(titles.includes("Payment received"));
    assert.ok(titles.includes("New customer"));
    assert.equal(titles.filter((t: string) => t === "New booking").length, 1, "the walk-in and the membership ledger row are not listed");
    assert.match(r.items.find((i: { title: string }) => i.title === "Payment received").text, /Rs\. 1500 by fonepay from Raju Rai/);
    assert.deepEqual([...r.items.map((i: { at: string }) => i.at)], [...r.items.map((i: { at: string }) => i.at)].sort().reverse());
    assert.ok(r.now);
  });

  it("only returns what is newer than the time asked for", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    await booking();
    const later = new Date(Date.now() + 60_000).toISOString();
    assert.equal((await api.get(`/activity?since=${encodeURIComponent(later)}`, owner.auth)).body.data.items.length, 0);
    assert.equal((await api.get("/activity?since=yesterday", owner.auth)).status, 400);
  });

  it("lists what other staff did, with the record to highlight, but not your own actions", async () => {
    const owner = await staff("owner");
    const desk = await staff("staff", "desk@test.np");
    await customer("9880000001", "Raju Rai");
    const b = await booking({ notes: "WALK_IN" });
    const log = (by: { id: string }, action: string, entity: string, entityId: string) =>
      prisma.adminAuditLog.create({ data: { staffId: by.id, staffName: by === owner ? "Owner" : "Desk", action, entity, entityId } });
    await log(desk, "walk-in", "booking", b.id);
    await log(desk, "digitalid-scan", "customer", "9880000001"); // routine: not announced
    await log(owner, "update", "customer", "9880000001"); // the owner's own action
    const items = (await api.get("/activity", owner.auth)).body.data.items as { title: string; text: string; href: string; ref?: string }[];
    const mine = items.filter((i) => i.title.startsWith("Staff:"));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].title, "Staff: Walk in");
    assert.match(mine[0].text, /^Desk, booking/);
    assert.equal(mine[0].href, `/slots?date=${today}`);
    assert.equal(mine[0].ref, `b-${b.id}`);
    // customer items carry the same kind of key the pages use
    assert.equal(items.find((i) => i.title === "New customer")?.ref, "u-9880000001");
  });

  it("hides the kinds a staff member may not open", async () => {
    await customer("9880000001", "Raju Rai");
    await prisma.complaint.create({ data: { code: "CP-1", userId: "9880000001", category: "Court", message: "The floor is wet" } });
    await booking();
    const acc = await staff("accountant"); // can see bookings and payments, not complaints
    const titles = (await api.get("/activity", acc.auth)).body.data.items.map((i: { title: string }) => i.title);
    assert.ok(titles.includes("New booking"));
    assert.equal(titles.includes("New complaint"), false);
    assert.equal((await api.get("/activity", {})).status, 401);
  });
});

describe("Orders customers make at the venue", () => {
  it("shows an app order for staff to bring, not the goods staff gave on credit themselves", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    const due = (saleId: string, createdBy: string, items: string, amount: number) =>
      prisma.goodsDue.create({ data: { userId: "9880000001", saleId, amount, items, lines: "[]", createdBy } });
    await due("s-app", "app:9880000001", "2 x Mineral Water Bottle, 1 x Frooty", 115);
    await due("s-staff", owner.id, "5 x Gloves", 500);
    const items = (await api.get("/activity", owner.auth)).body.data.items as { type: string; title: string; text: string; href: string }[];
    const orders = items.filter((i) => i.type === "order");
    assert.equal(orders.length, 1, "only the customer's own app order is announced");
    assert.equal(orders[0].title, "Order for the venue");
    assert.match(orders[0].text, /Raju Rai: 2 x Mineral Water Bottle, 1 x Frooty \(Rs\. 115\)/);
    assert.equal(orders[0].href, "/payments");
  });
});
