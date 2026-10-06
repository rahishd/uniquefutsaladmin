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
