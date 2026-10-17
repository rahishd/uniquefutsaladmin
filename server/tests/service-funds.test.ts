import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { addDaysKey, api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(async () => {
  await reset();
  await prisma.$executeRawUnsafe('DELETE FROM "ServiceWithdrawal"');
  await prisma.$executeRawUnsafe('DELETE FROM "ServiceDeposit"');
  await prisma.$executeRawUnsafe('DELETE FROM "ServiceFund"');
});
after(() => prisma.$disconnect());

const today = todayKey();

/** A paid futsal game; `addOns` is part of totalPrice (goods bought with the game). */
async function paidGame(phone: string, total: number, over: { date?: string; addOns?: number } = {}) {
  return prisma.booking.create({
    data: {
      userId: phone, date: over.date ?? today, startTime: "10:00", endTime: "11:00", duration: 1, basePrice: total - (over.addOns ?? 0), addOnsPrice: over.addOns ?? 0, subtotal: total, totalPrice: total,
      paymentMethod: "venue", status: "completed", paymentStatus: "completed", code: `SF-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

async function limited(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

const funds = async (auth: Record<string, string>, qs = "") => (await api.get(`/service-funds${qs}`, auth)).body.data;
const charity = async (auth: Record<string, string>, qs = "") => (await funds(auth, qs)).items[0];

describe("Collect Service Payment: automatic collection from futsal games", () => {
  it("starts with the 3% Charity Fund, worked out from futsal games only (no add-ons, no Gamezone)", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 2000, { addOns: 200 }); // the court part is 1800
    await paidGame("9800000891", 1000);
    await prisma.gzBooking.create({ data: { code: "GZ-SF-1", userId: "9800000891", consoleId: "c1", gameTitle: "FIFA", date: today, startHour: 12, hours: 1, players: 1, total: 300, paymentMethod: "venue", paymentStatus: "paid", status: "completed" } as never });
    // not counted: unpaid, and cancelled
    await prisma.booking.create({ data: { userId: "9800000891", date: today, startTime: "13:00", endTime: "14:00", duration: 1, basePrice: 999, subtotal: 999, totalPrice: 999, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending" } as never });
    await prisma.booking.create({ data: { userId: "9800000891", date: today, startTime: "14:00", endTime: "15:00", duration: 1, basePrice: 999, subtotal: 999, totalPrice: 999, paymentMethod: "venue", status: "cancelled", paymentStatus: "completed" } as never });

    const v = await funds(mgr.auth);
    assert.equal(v.base.games, 2800, "1800 + 1000: the court part of the paid games");
    assert.equal(v.base.gamesCount, 2);
    assert.equal(v.base.total, 3300, "the takings still show everything customers paid");
    const f = v.items[0];
    assert.deepEqual([f.name, f.kind, f.rate], ["Charity Fund", "percent", 3]);
    assert.equal(f.receivedToday, 84, "3% of 2800, deposited by itself");
    assert.equal(f.balance, 84);
    assert.equal(v.totals.receivedToday, 84);
  });

  it("deposits each day by itself: today follows today's games, a past day stays as it was", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await funds(mgr.auth); // makes the Charity Fund
    const yesterday = addDaysKey(today, -1);
    await prisma.serviceFund.updateMany({ data: { autoSince: yesterday } });
    await paidGame("9800000891", 1000, { date: yesterday });
    await paidGame("9800000891", 2000);

    let f = await charity(mgr.auth);
    assert.equal(f.balance, 90, "30 for yesterday + 60 for today");
    assert.equal(f.receivedToday, 60);
    assert.equal((await prisma.serviceDeposit.count({ where: { autoDay: { not: null } } })), 2, "one automatic deposit per day");

    // more games today: today's deposit grows (still ONE row); more games for yesterday: yesterday is frozen
    await paidGame("9800000891", 1000);
    await paidGame("9800000891", 1000, { date: yesterday });
    f = await charity(mgr.auth);
    assert.equal(f.receivedToday, 90);
    assert.equal(f.balance, 120, "30 (frozen) + 90");
    assert.equal(await prisma.serviceDeposit.count({ where: { autoDay: { not: null } } }), 2);
    const rows = await prisma.serviceDeposit.findMany({ orderBy: { depositedOn: "asc" } });
    assert.deepEqual(rows.map((r) => [r.depositedOn, r.amount, r.createdByName]), [[yesterday, 30, "Automatic"], [today, 90, "Automatic"]]);
  });

  it("does not collect for days before it started, nor while it is switched off", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 5000, { date: addDaysKey(today, -3) }); // before the fund existed here
    const fund = (await funds(mgr.auth)).items[0];
    assert.equal((await charity(mgr.auth)).balance, 0, "the Charity Fund starts today");
    await api.patch(`/service-funds/funds/${fund.id}`, mgr.auth, { active: false });
    await paidGame("9800000891", 1000);
    assert.equal((await charity(mgr.auth)).balance, 0, "switched off: nothing is collected");
    await api.patch(`/service-funds/funds/${fund.id}`, mgr.auth, { active: true });
    assert.equal((await charity(mgr.auth)).receivedToday, 30, "back on: it collects from today");
  });

  it("a new percent service collects from today at its own rate", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await funds(mgr.auth); // the Charity Fund is made the first time the page opens
  const turf = await api.post("/service-funds/funds", mgr.auth, { name: "Futsal Turf", kind: "percent", rate: 5 });
    assert.equal(turf.status, 201);
    await paidGame("9800000891", 2000);
    const v = await funds(mgr.auth);
    assert.deepEqual(v.items.map((i: { name: string; receivedToday: number }) => [i.name, i.receivedToday]), [["Charity Fund", 60], ["Futsal Turf", 100]]);
    assert.equal(v.totals.receivedToday, 160);
  });
});

describe("Collect Service Payment: date filter, daily collection and history", () => {
  it("filters what was received by date and lists each day's collection", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await funds(mgr.auth);
    await prisma.serviceFund.updateMany({ data: { autoSince: addDaysKey(today, -5) } });
    await paidGame("9800000891", 1000, { date: addDaysKey(today, -4) });
    await paidGame("9800000891", 2000, { date: addDaysKey(today, -1) });
    await paidGame("9800000891", 3000);
    assert.equal((await charity(mgr.auth)).balance, 180, "30 + 60 + 90");
    assert.equal((await charity(mgr.auth, `?from=${addDaysKey(today, -2)}`)).received, 150, "yesterday and today only");
    assert.equal((await charity(mgr.auth, `?from=${addDaysKey(today, -5)}&to=${addDaysKey(today, -3)}`)).received, 30);

    const c = (await api.get(`/service-funds/collections?from=${addDaysKey(today, -5)}`, mgr.auth)).body.data;
    assert.deepEqual(c.days.map((d: { date: string; games: number; base: number; funds: { amount: number }[] }) => [d.date, d.games, d.base, d.funds[0].amount]), [
      [today, 1, 3000, 90], [addDaysKey(today, -1), 1, 2000, 60], [addDaysKey(today, -4), 1, 1000, 30],
    ]);
    assert.deepEqual([c.totals.games, c.totals.base, c.totals.funds[0].amount], [3, 6000, 180]);
    assert.equal((await api.get(`/service-funds/collections?from=${today}&to=${addDaysKey(today, -2)}`, mgr.auth)).status, 400);
  });

  it("the history shows deposits and withdrawals together and filters by date and kind", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    const fund = (await funds(mgr.auth)).items[0];
    await prisma.serviceFund.updateMany({ data: { autoSince: addDaysKey(today, -5) } });
    await paidGame("9800000891", 10000, { date: addDaysKey(today, -4) }); // 300 collected on that day
    await api.post(`/service-funds/funds/${fund.id}/withdraw`, mgr.auth, { amount: 100, note: "Given to the school", date: addDaysKey(today, -3) });
    const all = (await api.get("/service-funds/ledger", mgr.auth)).body.data;
    assert.deepEqual(all.items.map((i: { type: string; amount: number; auto: boolean }) => [i.type, i.amount, i.auto]), [["withdrawal", 100, false], ["deposit", 300, true]]);
    assert.deepEqual([all.received, all.withdrawn, all.total], [300, 100, 2]);
    assert.equal((await api.get("/service-funds/ledger?type=withdrawal", mgr.auth)).body.data.items.length, 1);
    assert.equal((await api.get(`/service-funds/ledger?from=${addDaysKey(today, -3)}`, mgr.auth)).body.data.items.length, 1);
    assert.equal((await api.get("/service-funds/ledger?q=school", mgr.auth)).body.data.items[0].note, "Given to the school");
  });
});

describe("Collect Service Payment: withdraw", () => {
  it("takes money out of the balance, with a reason, and never more than the balance", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 10000); // 300 today
    const fund = await charity(mgr.auth);
    const url = `/service-funds/funds/${fund.id}/withdraw`;
    assert.equal((await api.post(url, mgr.auth, { amount: 100 })).status, 400, "a reason is required");
    assert.equal((await api.post(url, mgr.auth, { amount: 100, note: "x" })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: 0, note: "Nothing" })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: 10, note: "Tomorrow", date: addDaysKey(today, 1) })).status, 400, "not in the future");

    const over = await api.post(url, mgr.auth, { amount: 300.01, note: "Too much" });
    assert.equal(over.status, 409);
    assert.match(over.body.message, /Only Rs\. 300/);

    const ok = await api.post(url, mgr.auth, { amount: 120, note: "Donated to the school" });
    assert.equal(ok.status, 201);
    const after = await charity(mgr.auth);
    assert.deepEqual([after.depositedAll, after.withdrawnAll, after.balance, after.withdrawn], [300, 120, 180, 120]);
    assert.equal((await funds(mgr.auth)).totals.balance, 180);
    assert.equal((await api.post(url, mgr.auth, { amount: 181, note: "Over again" })).status, 409);
    assert.equal((await api.post(url, mgr.auth, { amount: 180, note: "The rest" })).status, 201);
    assert.equal((await charity(mgr.auth)).balance, 0);
    assert.ok((await prisma.adminAuditLog.count({ where: { action: "service-fund-withdraw" } })) >= 2);
  });

  it("two withdrawals at the same moment cannot both pass", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 10000); // 300
    const fund = await charity(mgr.auth);
    const url = `/service-funds/funds/${fund.id}/withdraw`;
    const r = await Promise.all([api.post(url, mgr.auth, { amount: 200, note: "First" }), api.post(url, mgr.auth, { amount: 200, note: "Second" })]);
    assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
    assert.equal((await charity(mgr.auth)).balance, 100);
  });

  it("is a separate permission: depositing or viewing is not withdrawing", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 10000);
    const fund = await charity(mgr.auth);
    const url = `/service-funds/funds/${fund.id}/withdraw`;
    const depositor = await limited(["servicefunds.view", "servicefunds.deposit"], "dep@test.np");
    assert.equal((await api.post(url, depositor.auth, { amount: 10, note: "Nope" })).status, 403);
    const treasurer = await limited(["servicefunds.view", "servicefunds.withdraw"], "treas@test.np");
    assert.equal((await api.post(url, treasurer.auth, { amount: 10, note: "Allowed" })).status, 201);
  });
});

describe("Collect Service Payment: manual services and checks", () => {
  it("lets staff add a manual service, deposit to it and withdraw from it", async () => {
    const mgr = await staff("admin");
    const m = await api.post("/service-funds/funds", mgr.auth, { name: "Maintenance", kind: "manual", defaultAmount: 5000 });
    assert.equal(m.status, 201);
    assert.equal((await api.post("/service-funds/funds", mgr.auth, { name: "maintenance", kind: "manual" })).status, 409, "same name");
    assert.equal((await api.post("/service-funds/funds", mgr.auth, { name: "Lights", kind: "percent" })).status, 400, "a percent service needs its percentage");
    const id = m.body.data.id;
    assert.equal((await api.post(`/service-funds/funds/${id}/deposit`, mgr.auth, { amount: 4500, note: "Owner top-up" })).status, 201);
    assert.equal((await api.post(`/service-funds/funds/${id}/withdraw`, mgr.auth, { amount: 1500, note: "Paid the electrician" })).status, 201);
    const item = (await funds(mgr.auth)).items.find((i: { name: string }) => i.name === "Maintenance");
    assert.deepEqual([item.toDeposit, item.balance, item.receivedToday], [null, 3000, 4500], "manual funds have no automatic collection");
  });

  it("checks the deposit amount and date, and a switched-off service takes no deposits", async () => {
    const mgr = await staff("admin");
    const fund = await charity(mgr.auth);
    const url = `/service-funds/funds/${fund.id}/deposit`;
    assert.equal((await api.post(url, mgr.auth, { amount: 0 })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: -5 })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: 10, date: addDaysKey(today, 1) })).status, 400, "not in the future");
    await api.patch(`/service-funds/funds/${fund.id}`, mgr.auth, { active: false });
    assert.equal((await api.post(url, mgr.auth, { amount: 10 })).status, 409);
  });

  it("screens by permission", async () => {
    const mgr = await staff("admin");
    const fund = await charity(mgr.auth);
    const viewer = await limited(["servicefunds.view"], "view@test.np");
    for (const p of ["/service-funds", "/service-funds/collections", "/service-funds/ledger"]) assert.equal((await api.get(p, viewer.auth)).status, 200);
    assert.equal((await api.post(`/service-funds/funds/${fund.id}/deposit`, viewer.auth, { amount: 5 })).status, 403);
    assert.equal((await api.post("/service-funds/funds", viewer.auth, { name: "Nope", kind: "manual" })).status, 403);
    const none = await limited([], "none@test.np");
    assert.equal((await api.get("/service-funds", none.auth)).status, 403);
    assert.equal((await api.get("/service-funds/ledger", none.auth)).status, 403);
  });
});
