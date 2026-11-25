import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, prisma, reset, staff, todayKey } from "./helpers";
import { figures } from "../src/modules/payroll";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const m = (month: string, amount: number) => ({ month, amount });

describe("payroll figures: what is owed carries over from month to month", () => {
  it("a salary applies from its month on; unpaid salary carries over; paid ahead shows as a credit", () => {
    const salaries = [m("2026-09", 9000), m("2026-11", 10000)];
    const payments = [m("2026-09", 4000), m("2026-10", 9000)];
    // September: the first month, 9,000 salary, 4,000 paid
    assert.deepEqual(figures(salaries, payments, "2026-09"), { salary: 9000, previousDues: 0, paid: 4000, remaining: 5000 });
    // October: 5,000 carried over, 9,000 salary, 9,000 paid -> 5,000 still owed
    assert.deepEqual(figures(salaries, payments, "2026-10"), { salary: 9000, previousDues: 5000, paid: 9000, remaining: 5000 });
    // November: the raise to 10,000 applies from this month; the 5,000 is still carried over and nothing is paid
    assert.deepEqual(figures(salaries, payments, "2026-11"), { salary: 10000, previousDues: 5000, paid: 0, remaining: 15000 });
    // a month before any salary: nothing owed
    assert.deepEqual(figures(salaries, payments, "2026-08"), { salary: null, previousDues: 0, paid: 0, remaining: 0 });
    // paid more than the salary: the extra shows as a negative carry-over
    assert.equal(figures([m("2026-10", 1000)], [m("2026-10", 1500)], "2026-11").previousDues, -500);
  });
});

describe("Payroll page: the API", () => {
  it("lists everyone with the salary, what was paid and what is left; setting a salary and paying update it", async () => {
    const owner = await staff("owner");
    const other = await staff("staff", "roshni@test.np");
    const month = todayKey().slice(0, 7);

    let page = (await api.get(`/payroll?month=${month}`, owner.auth)).body.data;
    assert.equal(page.rows.length, 2);
    assert.equal(page.rows.find((r: { staffId: string }) => r.staffId === other.id).salary, null, "salary not set yet");
    assert.deepEqual(page.totals, { salaries: 0, paid: 0, stillToPay: 0, owed: 0 });

    assert.equal((await api.put(`/payroll/staff/${other.id}/salary`, owner.auth, { amount: 9000, month })).status, 200);
    page = (await api.get(`/payroll?month=${month}`, owner.auth)).body.data;
    assert.equal(page.totals.salaries, 9000);
    assert.equal(page.totals.stillToPay, 9000);
    assert.equal(page.totals.owed, 1);

    assert.equal((await api.post(`/payroll/staff/${other.id}/pay`, owner.auth, { amount: 3500.5, month, note: "Advance" })).status, 201);
    page = (await api.get(`/payroll?month=${month}`, owner.auth)).body.data;
    const row = page.rows.find((r: { staffId: string }) => r.staffId === other.id);
    assert.equal(row.paid, 3500.5);
    assert.equal(row.remaining, 5499.5);
    assert.equal(page.totals.paid, 3500.5);

    const history = (await api.get(`/payroll/staff/${other.id}/history`, owner.auth)).body.data;
    assert.equal(history.months[0].month, month);
    assert.equal(history.payments.length, 1);
    assert.equal(history.payments[0].note, "Advance");

    // a mistaken payment can be undone
    assert.equal((await api.del(`/payroll/payments/${history.payments[0].id}`, owner.auth)).status, 200);
    page = (await api.get(`/payroll?month=${month}`, owner.auth)).body.data;
    assert.equal(page.totals.paid, 0);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "payroll" } })) >= 3, "every change is in the audit log");
  });

  it("refuses a future month, a bad amount and anyone without the permission", async () => {
    const owner = await staff("owner");
    const other = await staff("staff", "roshni@test.np");
    const month = todayKey().slice(0, 7);
    const future = `${Number(month.slice(0, 4)) + 1}-01`;
    assert.equal((await api.post(`/payroll/staff/${other.id}/pay`, owner.auth, { amount: 100, month: future })).status, 400);
    assert.equal((await api.post(`/payroll/staff/${other.id}/pay`, owner.auth, { amount: 0, month })).status, 400);
    assert.equal((await api.put(`/payroll/staff/${other.id}/salary`, owner.auth, { amount: -5, month })).status, 400);
    assert.equal((await api.get(`/payroll?month=2026-13`, owner.auth)).status, 400);
    // a staff account with no payroll permission sees and changes nothing
    assert.equal((await api.get(`/payroll`, other.auth)).status, 403);
    assert.equal((await api.put(`/payroll/staff/${other.id}/salary`, other.auth, { amount: 1, month })).status, 403);
    assert.equal((await api.post(`/payroll/staff/${other.id}/pay`, other.auth, { amount: 1, month })).status, 403);
  });
});
