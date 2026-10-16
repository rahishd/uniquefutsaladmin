import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { addDaysKey, api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const today = todayKey();

async function paidGame(phone: string, total: number) {
  return prisma.booking.create({
    data: {
      userId: phone, date: today, startTime: "10:00", endTime: "11:00", duration: 1, basePrice: total, subtotal: total, totalPrice: total,
      paymentMethod: "venue", status: "completed", paymentStatus: "completed", code: `SF-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

async function limited(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

describe("Collect Service Payment", () => {
  it("starts with the 3% Charity Fund and works it out from what customers paid", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 2000);
    await paidGame("9800000891", 1000);
    await prisma.gzBooking.create({ data: { code: "GZ-SF-1", userId: "9800000891", consoleId: "c1", gameTitle: "FIFA", date: today, startHour: 12, hours: 1, players: 1, total: 300, paymentMethod: "venue", paymentStatus: "paid", status: "completed" } });
    // not counted: unpaid, and cancelled
    await prisma.booking.create({ data: { userId: "9800000891", date: today, startTime: "13:00", endTime: "14:00", duration: 1, basePrice: 999, subtotal: 999, totalPrice: 999, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending", code: "SF-UNPAID" } });

    const r = await api.get("/service-funds", mgr.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.base.total, 3300);
    const f = r.body.data.items[0];
    assert.deepEqual([f.name, f.kind, f.rate, f.accrued, f.deposited, f.toDeposit], ["Charity Fund", "percent", 3, 99, 0, 99]);
  });

  it("Deposit Amount saves a record, lowers what is still to set aside and shows in the history", async () => {
    const mgr = await staff("admin");
    await customer("9800000891", "Payer");
    await paidGame("9800000891", 10000); // 3% = 300
    const fund = (await api.get("/service-funds", mgr.auth)).body.data.items[0];

    const d = await api.post(`/service-funds/funds/${fund.id}/deposit`, mgr.auth, { amount: 200, note: "Given to the school fund" });
    assert.equal(d.status, 201);
    const after = (await api.get("/service-funds", mgr.auth)).body.data.items[0];
    assert.deepEqual([after.deposited, after.deposits, after.toDeposit], [200, 1, 100]);

    const hist = await api.get("/service-funds/deposits", mgr.auth);
    assert.equal(hist.body.data.total, 1);
    assert.equal(hist.body.data.items[0].note, "Given to the school fund");
    assert.equal(hist.body.data.items[0].amount, 200);
    assert.equal(hist.body.data.sum, 200);
    assert.ok(hist.body.data.items[0].by);
    // recorded in the audit trail
    assert.ok((await prisma.adminAuditLog.count({ where: { action: "service-fund-deposit" } })) >= 1);
  });

  it("lets staff add a manual service and keeps its deposits apart", async () => {
    const mgr = await staff("admin");
    const m = await api.post("/service-funds/funds", mgr.auth, { name: "Maintenance", kind: "manual", defaultAmount: 5000 });
    assert.equal(m.status, 201);
    const balls = await api.post("/service-funds/funds", mgr.auth, { name: "Ball amounts", kind: "manual" });
    assert.equal(balls.status, 201);
    assert.equal((await api.post("/service-funds/funds", mgr.auth, { name: "maintenance", kind: "manual" })).status, 409, "same name");
    assert.equal((await api.post("/service-funds/funds", mgr.auth, { name: "Lights", kind: "percent" })).status, 400, "a percent service needs its percentage");

    await api.post(`/service-funds/funds/${m.body.data.id}/deposit`, mgr.auth, { amount: 4500 });
    await api.post(`/service-funds/funds/${balls.body.data.id}/deposit`, mgr.auth, { amount: 1200, note: "6 new balls" });
    const only = await api.get(`/service-funds/deposits?fundId=${balls.body.data.id}`, mgr.auth);
    assert.deepEqual(only.body.data.items.map((x: { fund: string; amount: number }) => [x.fund, x.amount]), [["Ball amounts", 1200]]);
    const list = (await api.get("/service-funds", mgr.auth)).body.data;
    assert.equal(list.items.find((i: { name: string }) => i.name === "Maintenance").toDeposit, null, "manual funds have no accrual");
    assert.equal(list.totals.deposited, 5700);
  });

  it("checks the amount and the date, and a switched-off service takes no deposits", async () => {
    const mgr = await staff("admin");
    const fund = (await api.get("/service-funds", mgr.auth)).body.data.items[0];
    const url = `/service-funds/funds/${fund.id}/deposit`;
    assert.equal((await api.post(url, mgr.auth, { amount: 0 })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: -5 })).status, 400);
    assert.equal((await api.post(url, mgr.auth, { amount: 10, date: addDaysKey(today, 1) })).status, 400, "not in the future");
    await api.patch(`/service-funds/funds/${fund.id}`, mgr.auth, { active: false });
    assert.equal((await api.post(url, mgr.auth, { amount: 10 })).status, 409);
  });

  it("filters the history by date and screens by permission", async () => {
    const mgr = await staff("admin");
    const fund = (await api.get("/service-funds", mgr.auth)).body.data.items[0];
    await api.post(`/service-funds/funds/${fund.id}/deposit`, mgr.auth, { amount: 100, date: addDaysKey(today, -10) });
    await api.post(`/service-funds/funds/${fund.id}/deposit`, mgr.auth, { amount: 50 });
    const recent = await api.get(`/service-funds/deposits?from=${addDaysKey(today, -2)}`, mgr.auth);
    assert.deepEqual(recent.body.data.items.map((x: { amount: number }) => x.amount), [50]);

    const viewer = await limited(["servicefunds.view"], "view@test.np");
    assert.equal((await api.get("/service-funds", viewer.auth)).status, 200);
    assert.equal((await api.post(`/service-funds/funds/${fund.id}/deposit`, viewer.auth, { amount: 5 })).status, 403);
    assert.equal((await api.post("/service-funds/funds", viewer.auth, { name: "Nope", kind: "manual" })).status, 403);
    const none = await limited([], "none@test.np");
    assert.equal((await api.get("/service-funds", none.auth)).status, 403);
  });
});
