import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const entry = (userId: string, kind: string, points: number, extra: object = {}) =>
  prisma.loyaltyEntry.create({ data: { userId, kind, points, earnedOn: today, expiresOn: kind === "membership" ? null : addDaysKey(today, 90), sourceType: "test", sourceId: `${kind}-${userId}-${Math.random()}`, detail: `${kind} test`, ...extra } });

describe("Loyalty points page", () => {
  it("lists customers with their balance, what expires soon and unused vouchers, and searches and sorts them", async () => {
    const mgr = await staff("admin");
    await customer("9890000001", "Raju Rai"); await customer("9890000002", "Sita Shah");
    await entry("9890000001", "game", 12.5);
    await entry("9890000001", "game", 5, { expiresOn: addDaysKey(today, 10) }); // expires soon
    await entry("9890000001", "game", 3, { expiresOn: addDaysKey(today, -2) }); // already expired: not counted
    await entry("9890000001", "free_game", -10);
    await entry("9890000002", "membership", 30);
    await prisma.freeGameVoucher.create({ data: { userId: "9890000001", period: "Evening", cost: 10, status: "unused" } });
    await prisma.freeGameVoucher.create({ data: { userId: "9890000001", period: "Day", cost: 10, status: "used" } });
    const list = (await api.get("/loyalty/customers", mgr.auth)).body.data;
    assert.equal(list.total, 2);
    assert.deepEqual(list.items[0], { phone: "9890000002", name: "Sita Shah", balance: 30, expiringSoon: 0, unusedVouchers: 0 });
    assert.deepEqual(list.items[1], { phone: "9890000001", name: "Raju Rai", balance: 7.5, expiringSoon: 5, unusedVouchers: 1 }, "12.5 + 5 earned and valid, 10 spent; the expired 3 is left out");
    assert.equal((await api.get("/loyalty/customers?q=raju", mgr.auth)).body.data.total, 1);
    assert.equal((await api.get("/loyalty/customers?sort=expiring", mgr.auth)).body.data.items[0].phone, "9890000001");
  });

  it("works out the overview: points given and spent in the period, owed now, expiring soon and vouchers", async () => {
    const mgr = await staff("admin");
    await customer("9890000001", "Raju Rai");
    await entry("9890000001", "game", 20);
    await entry("9890000001", "goods", 8, { expiresOn: addDaysKey(today, 5) });
    await entry("9890000001", "free_game", -10);
    await entry("9890000001", "game", 40, { earnedOn: addDaysKey(today, -60), expiresOn: addDaysKey(today, 30) }); // before the period
    await prisma.freeGameVoucher.create({ data: { userId: "9890000001", period: "Evening", cost: 10, status: "unused" } });
    const o = (await api.get("/loyalty/overview", mgr.auth)).body.data;
    assert.equal(o.period.earned, 28);
    assert.equal(o.period.spent, 10);
    assert.deepEqual(o.period.byKind.find((k: { kind: string }) => k.kind === "game"), { kind: "game", points: 20, entries: 1 });
    assert.equal(o.now.owedPoints, 58, "20 + 8 + 40 - 10");
    assert.deepEqual([o.now.expiringSoon.points, o.now.expiringSoon.customers], [48, 1], "the goods points (5 days) and the old game points (30 days)");
    assert.deepEqual(o.now.vouchers, { unused: 1, used: 0, void: 0 });
    assert.equal((await api.get(`/loyalty/overview?from=${today}&to=${addDaysKey(today, -1)}`, mgr.auth)).status, 400);
  });

  it("shows the ledger across customers with filters, and the vouchers with a status filter", async () => {
    const mgr = await staff("admin");
    await customer("9890000001", "Raju Rai"); await customer("9890000002", "Sita Shah");
    await entry("9890000001", "game", 12.5);
    await entry("9890000002", "goods", 4, { detail: "Goods Rs. 400" });
    await entry("9890000002", "game", 3, { expiresOn: addDaysKey(today, -1) });
    const all = (await api.get("/loyalty/ledger", mgr.auth)).body.data;
    assert.equal(all.total, 3);
    assert.equal(all.items.find((i: { expired: boolean }) => i.expired).points, 3);
    assert.equal((await api.get("/loyalty/ledger?kind=goods", mgr.auth)).body.data.total, 1);
    assert.equal((await api.get("/loyalty/ledger?q=sita", mgr.auth)).body.data.total, 2);
    assert.equal((await api.get("/loyalty/ledger?kind=nonsense", mgr.auth)).status, 400);
    await prisma.freeGameVoucher.create({ data: { userId: "9890000001", period: "Evening", cost: 10, status: "unused" } });
    await prisma.freeGameVoucher.create({ data: { userId: "9890000002", period: "Day", cost: 8, status: "void" } });
    const v = (await api.get("/loyalty/vouchers?status=unused", mgr.auth)).body.data;
    assert.deepEqual([v.total, v.items[0].name, v.items[0].period], [1, "Raju Rai", "Evening"]);
    assert.equal((await api.get("/loyalty/vouchers", mgr.auth)).body.data.total, 2);
  });

  it("adjusts points and voids a voucher as before, and needs the loyalty permission", async () => {
    const mgr = await staff("admin");
    await customer("9890000001", "Raju Rai");
    assert.equal((await api.post("/loyalty/adjust", mgr.auth, { phone: "9890000001", points: 15, reason: "Goodwill for the rain" })).status, 200);
    assert.equal((await api.get("/loyalty/customers", mgr.auth)).body.data.items[0].balance, 15);
    const v = await prisma.freeGameVoucher.create({ data: { userId: "9890000001", period: "Evening", cost: 10, status: "unused" } });
    assert.equal((await api.post(`/loyalty/vouchers/${v.id}/void`, mgr.auth)).status, 200);
    const acc = await staff("accountant");
    assert.equal((await api.get("/loyalty/overview", acc.auth)).status, 200, "the accountant may look");
    assert.equal((await api.post("/loyalty/adjust", acc.auth, { phone: "9890000001", points: 5, reason: "Not allowed here" })).status, 403);
    assert.equal((await api.get("/loyalty/customers", {})).status, 401);
  });
});
