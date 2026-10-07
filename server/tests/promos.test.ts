import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const promo = (extra: object = {}) => ({ code: "tihar20", type: "percent", value: 20, label: "20% OFF", appliedTo: "booking", ...extra });

describe("Promo codes page", () => {
  it("lists each code with its state and how much it was used, on bookings and memberships", async () => {
    const mgr = await staff("admin");
    await customer("9891000001", "Raju Rai");
    await api.post("/promos", mgr.auth, promo());
    await api.post("/promos", mgr.auth, promo({ code: "OLD10", label: "10% OFF", value: 10, expiryDate: addDaysKey(today, 5) }));
    await api.post("/promos", mgr.auth, promo({ code: "PAUSED5", label: "5% OFF", value: 5, isActive: false }));
    // an expired one is made directly: the form refuses to create one that already ended
    const stored = JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "promoCodes" } })).value);
    stored.push({ code: "GONE", type: "flat", value: 100, label: "Rs. 100 OFF", appliedTo: "booking", expiryDate: addDaysKey(today, -1) });
    await prisma.settings.update({ where: { key: "promoCodes" }, data: { value: JSON.stringify(stored) } });
    const mk = (status: string, discountAmount: number, extra: object = {}) => prisma.booking.create({ data: { userId: "9891000001", date: today, startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1200, paymentMethod: "venue", status, paymentStatus: "pending", promoCode: "TIHAR20", discountAmount, ...extra } });
    await mk("confirmed", 300);
    await mk("confirmed", 300, { startTime: "19:00", endTime: "20:00" });
    await mk("cancelled", 300, { startTime: "20:00", endTime: "21:00" }); // not counted
    const plan = await prisma.membershipPlan.create({ data: { name: "Premium", price: 2000, perks: "[]" } });
    await prisma.membershipSubscription.create({ data: { planId: plan.id, userId: "9891000001", startDate: new Date(), endDate: new Date(Date.now() + 86400000 * 30), status: "active", promoCode: "tihar20", discountAmount: 500, chosenDays: [] } });

    const list = (await api.get("/promos", mgr.auth)).body.data;
    const by = (c: string) => list.find((p: { code: string }) => p.code === c);
    assert.deepEqual([by("TIHAR20").status, by("OLD10").status, by("PAUSED5").status, by("GONE").status], ["active", "active", "paused", "expired"]);
    assert.deepEqual([by("TIHAR20").uses, by("TIHAR20").discountGiven], [3, 1100], "two bookings and the membership, case ignored, the cancelled booking left out");
    assert.deepEqual([by("OLD10").uses, by("OLD10").discountGiven], [0, 0]);
    assert.ok(by("TIHAR20").lastUsedAt);
  });

  it("pauses and resumes a code, and the customer-facing code is stored as before", async () => {
    const mgr = await staff("admin");
    await api.post("/promos", mgr.auth, promo());
    const p = await api.patch("/promos/TIHAR20/active", mgr.auth, { isActive: false });
    assert.equal(p.status, 200);
    assert.equal(p.body.data.isActive, false);
    assert.equal(JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "promoCodes" } })).value)[0].isActive, false);
    assert.equal((await api.patch("/promos/TIHAR20/active", mgr.auth, { isActive: true })).body.data.isActive, true);
    assert.equal((await api.patch("/promos/NOPE/active", mgr.auth, { isActive: true })).status, 404);
    assert.equal(await prisma.adminAuditLog.count({ where: { entity: "promo", action: { in: ["pause", "resume"] } } }), 2);
  });

  it("refuses a code that already ended, a half time window, a window backwards, or a VIP code's name", async () => {
    const mgr = await staff("admin");
    assert.equal((await api.post("/promos", mgr.auth, promo({ expiryDate: addDaysKey(today, -1) }))).status, 400);
    assert.equal((await api.post("/promos", mgr.auth, promo({ startTime: "06:00" }))).status, 400);
    assert.equal((await api.post("/promos", mgr.auth, promo({ startTime: "10:00", endTime: "08:00" }))).status, 400);
    assert.equal((await api.post("/promos", mgr.auth, promo({ startTime: "06:00", endTime: "10:00", validDays: ["Mon", "Tue"] }))).status, 201);
    await customer("9891000002", "Sita");
    await prisma.vipCode.create({ data: { userId: "9891000002", code: "SITAVIP", type: "percent", value: 10, createdBy: mgr.id } });
    assert.equal((await api.post("/promos", mgr.auth, promo({ code: "sitavip" }))).status, 409);
  });

  it("is limited by permission", async () => {
    const desk = await staff("frontdesk");
    assert.equal((await api.get("/promos", desk.auth)).status, 200, "front desk may look");
    assert.equal((await api.post("/promos", desk.auth, promo())).status, 403);
    assert.equal((await api.patch("/promos/TIHAR20/active", desk.auth, { isActive: false })).status, 403);
    assert.equal((await api.get("/promos", {})).status, 401);
  });
});

describe("Promo code days", () => {
  it("stores days as full names, which is what the customer app compares, and accepts short names", async () => {
    const mgr = await staff("admin");
    const r = await api.post("/promos", mgr.auth, { code: "WEEKEND", type: "percent", value: 10, label: "10% OFF", appliedTo: "booking", validDays: ["Sat", "sunday", "Monday"] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.data.validDays, ["Saturday", "Sunday", "Monday"]);
    assert.deepEqual(JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "promoCodes" } })).value)[0].validDays, ["Saturday", "Sunday", "Monday"]);
    assert.equal((await api.post("/promos", mgr.auth, { code: "BADDAY", type: "percent", value: 10, label: "10% OFF", appliedTo: "booking", validDays: ["Funday"] })).status, 400);
  });
});
