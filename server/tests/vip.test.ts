import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const used = (userId: string, code: string, n: number, extra: object = {}) =>
  prisma.booking.create({ data: { userId, date: addDaysKey(today, -n), startTime: "18:00", endTime: "19:00", duration: 1, customerName: "x", basePrice: 1000, subtotal: 1000, totalPrice: 900, discountAmount: 100, promoCode: code, paymentMethod: "venue", status: "completed", paymentStatus: "completed", code: `UF-${userId.slice(-3)}-${n}`, ...extra } });

describe("VIP privilege page", () => {
  it("makes a fresh code that is easy to read out and not already taken", async () => {
    const mgr = await staff("manager");
    await customer("9850000001", "Taken Code");
    await prisma.vipCode.create({ data: { userId: "9850000001", code: "VIPAAAAA", type: "percent", value: 10, createdBy: mgr.id } });
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const code = (await api.get("/vip/generate-code", mgr.auth)).body.data.code as string;
      assert.match(code, /^VIP[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);
      assert.notEqual(code, "VIPAAAAA");
      seen.add(code);
    }
    assert.ok(seen.size >= 7, "codes differ from each other");
  });

  it("gives a customer a generated or chosen code, one per customer, never a normal promo code's name", async () => {
    await customer("9850000002", "Rita Vip");
    await customer("9850000003", "Sam Vip");
    const mgr = await staff("manager");
    await prisma.settings.create({ data: { key: "promoCodes", value: JSON.stringify([{ code: "TIHAR20", type: "percent", value: 20, label: "20%", appliedTo: "booking", isActive: true }]) } });

    const gen = await api.post("/vip", mgr.auth, { phone: "9850000002", type: "percent", value: 10, note: "Owner's friend" });
    assert.equal(gen.status, 201);
    assert.match(gen.body.data.code, /^VIP[A-Z0-9]{5}$/);
    assert.equal(gen.body.data.customerName, "Rita Vip");
    assert.equal(gen.body.data.claimedAt, null);
    assert.equal(gen.body.data.active, true);

    const chosen = await api.post("/vip", mgr.auth, { phone: "9850000003", code: "vip", type: "flat", value: 250 });
    assert.equal(chosen.status, 201);
    assert.equal(chosen.body.data.code, "VIP");

    assert.equal((await api.post("/vip", mgr.auth, { phone: "9850000002", type: "percent", value: 5 })).status, 409, "already has one");
    await customer("9850000004", "Third");
    assert.equal((await api.post("/vip", mgr.auth, { phone: "9850000004", code: "tihar20", type: "percent", value: 5 })).status, 409, "normal promo code");
    assert.equal((await api.post("/vip", mgr.auth, { phone: "9899999999", type: "percent", value: 5 })).status, 404);
    for (const bad of [{ type: "percent", value: 0 }, { type: "percent", value: 101 }, { type: "flat", value: 100001 }, { type: "gift", value: 5 }, { type: "percent", value: 5, code: "a" }, { type: "percent", value: 5, code: "no spaces" }]) {
      assert.equal((await api.post("/vip", mgr.auth, { phone: "9850000004", ...bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal(await prisma.vipCode.count(), 2);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "vip-give" } }), 2);
  });

  it("only managers and owners give VIP privileges, front desk can look", async () => {
    await customer("9850000005", "Someone");
    const fd = await staff("frontdesk");
    assert.equal((await api.post("/vip", fd.auth, { phone: "9850000005", type: "percent", value: 10 })).status, 403);
    assert.equal((await api.get("/vip", fd.auth)).status, 200);
    assert.equal(await prisma.vipCode.count(), 0);
  });

  it("lists every VIP customer with whether they typed the code, games discounted and money saved; filters and search", async () => {
    await customer("9850000006", "Anita Gold");
    await customer("9850000007", "Binod Silver");
    await customer("9850000008", "Chandra Bronze");
    const mgr = await staff("manager");
    const mk = (userId: string, code: string, extra: object = {}) => prisma.vipCode.create({ data: { userId, code, type: "percent", value: 10, createdBy: mgr.id, ...extra } });
    await mk("9850000006", "GOLD10", { claimedAt: new Date(), note: "Regular since 2020" });
    await mk("9850000007", "SILVER10", { claimedAt: new Date(), active: false });
    await mk("9850000008", "BRONZE10");
    await used("9850000006", "GOLD10", 1);
    await used("9850000006", "GOLD10", 2);
    await used("9850000006", "GOLD10", 3, { status: "cancelled" }); // does not count
    await used("9850000006", "OTHERCODE", 4); // a different code does not count
    await used("9850000007", "SILVER10", 5);

    const all = (await api.get("/vip", mgr.auth)).body.data;
    assert.equal(all.total, 3);
    assert.deepEqual(all.totals, { customers: 3, active: 2, paused: 1, entered: 2, games: 3, discountGiven: 300 });
    const gold = all.items.find((i: { code: string }) => i.code === "GOLD10");
    assert.deepEqual({ name: gold.customerName, phone: gold.phone, usage: gold.usage }, { name: "Anita Gold", phone: "9850000006", usage: { games: 2, discountGiven: 200 } });

    const by = (qs: string) => api.get(`/vip?${qs}`, mgr.auth).then((r) => r.body.data.items.map((i: { code: string }) => i.code).sort());
    assert.deepEqual(await by("status=active"), ["BRONZE10", "GOLD10"]);
    assert.deepEqual(await by("status=paused"), ["SILVER10"]);
    assert.deepEqual(await by("status=unclaimed"), ["BRONZE10"]);
    assert.deepEqual(await by("q=anita"), ["GOLD10"], "by customer name");
    assert.deepEqual(await by("q=9850000007"), ["SILVER10"], "by phone");
    assert.deepEqual(await by("q=bronze"), ["BRONZE10"], "by code");
    assert.deepEqual(await by("q=2020"), ["GOLD10"], "by note");
  });

  it("the Customers list marks who already has a VIP code", async () => {
    await customer("9850000009", "Has Vip");
    await customer("9850000010", "No Vip");
    const mgr = await staff("manager");
    await api.post("/vip", mgr.auth, { phone: "9850000009", code: "MYVIP", type: "percent", value: 15 });
    const items = (await api.get("/customers", mgr.auth)).body.data.items;
    assert.deepEqual(items.find((i: { phoneNumber: string }) => i.phoneNumber === "9850000009").vip, { code: "MYVIP", active: true });
    assert.equal(items.find((i: { phoneNumber: string }) => i.phoneNumber === "9850000010").vip, null);
  });

  it("edits, pauses and removes go through the customer routes and show up on the page", async () => {
    await customer("9850000011", "Editable");
    const mgr = await staff("manager");
    await api.post("/vip", mgr.auth, { phone: "9850000011", code: "EDIT10", type: "percent", value: 10 });
    await api.put("/customers/9850000011/vip", mgr.auth, { code: "EDIT10", type: "flat", value: 300, active: false });
    const row = (await api.get("/vip", mgr.auth)).body.data.items[0];
    assert.deepEqual({ type: row.type, value: row.value, active: row.active }, { type: "flat", value: 300, active: false });
    assert.equal((await api.del("/customers/9850000011/vip", mgr.auth)).status, 200);
    assert.equal((await api.get("/vip", mgr.auth)).body.data.total, 0);
  });
});
