// Payroll (Admin): each staff member's monthly salary and the money given to them.
//   - A salary applies from a month on (the latest one set at or before a month is that month's salary), so changing it never rewrites the past.
//   - Money can be paid any amount, any time. It counts toward a payroll month (the month being looked at).
//   - Whatever is left unpaid carries over: previous dues = every earlier month's salary minus everything paid for earlier months.
// Seeing it needs payroll.view; setting a salary, paying and undoing a payment need payroll.manage. Every change is written to the audit log.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const payrollRouter = Router();

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => todayKey().slice(0, 7);
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: { toString(): string } | number) => Number(d);
const monthParam = z.string().regex(MONTH, "Use a month like 2026-11");
const money = z.number().finite().min(0).max(10_000_000).transform(r2);

type Money = { month: string; amount: number };

/** The salary, what is carried over, what was paid and what is left, for one person in one month. */
export function figures(salaries: Money[], payments: Money[], month: string) {
  const sorted = [...salaries].sort((a, b) => a.month.localeCompare(b.month));
  const salaryFor = (m: string) => {
    let a: number | null = null;
    for (const s of sorted) { if (s.month <= m) a = s.amount; else break; }
    return a;
  };
  const first = sorted[0]?.month ?? null;
  let prevSalary = 0;
  if (first) for (let k = first, n = 0; k < month && n < 600; k = nextMonth(k), n++) prevSalary += salaryFor(k) ?? 0;
  const prevPaid = payments.filter((p) => p.month < month).reduce((t, p) => t + p.amount, 0);
  const paid = payments.filter((p) => p.month === month).reduce((t, p) => t + p.amount, 0);
  const salary = salaryFor(month);
  const previousDues = r2(prevSalary - prevPaid); // below zero means the person was paid ahead
  return { salary, previousDues, paid: r2(paid), remaining: r2((salary ?? 0) + previousDues - paid) };
}

const moneyRows = (rows: { month: string; amount: { toString(): string } }[]): Money[] => rows.map((r) => ({ month: r.month, amount: num(r.amount) }));

payrollRouter.get("/", requirePermission("payroll.view"), handler(async (req, res) => {
  const month = req.query.month ? parse(monthParam, req.query.month) : thisMonth();
  const [salaries, payments, staff] = await Promise.all([prisma.staffSalary.findMany(), prisma.staffPayment.findMany(), prisma.staffUser.findMany({ orderBy: [{ createdAt: "asc" }] })]);
  const withRecords = new Set([...salaries.map((s) => s.staffId), ...payments.map((p) => p.staffId)]);
  const rows = staff.filter((s) => s.isActive || withRecords.has(s.id)).map((s) => {
    const f = figures(moneyRows(salaries.filter((x) => x.staffId === s.id)), moneyRows(payments.filter((x) => x.staffId === s.id)), month);
    return { staffId: s.id, name: s.name, email: s.email, role: s.role, isActive: s.isActive, ...f };
  });
  const totals = {
    salaries: r2(rows.reduce((t, r) => t + (r.salary ?? 0), 0)),
    paid: r2(rows.reduce((t, r) => t + r.paid, 0)),
    stillToPay: r2(rows.reduce((t, r) => t + Math.max(0, r.remaining), 0)),
    owed: rows.filter((r) => r.remaining > 0).length,
  };
  send(res, { month, currentMonth: thisMonth(), totals, rows, canManage: !!req.staff!.permissions.includes("payroll.manage") });
}));

// set a salary from a month on (the month being looked at); setting it again for the same month replaces it
payrollRouter.put("/staff/:id/salary", requirePermission("payroll.manage"), handler(async (req, res) => {
  const b = parse(z.object({ amount: money, month: monthParam }), req.body);
  const person = await prisma.staffUser.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true } });
  if (!person) throw new AppError(404, "Staff member not found");
  const data = { amount: b.amount, setById: req.staff!.id, setByName: req.staff!.name };
  const row = await prisma.staffSalary.upsert({ where: { staffId_month: { staffId: person.id, month: b.month } }, update: data, create: { staffId: person.id, month: b.month, ...data } });
  await audit(req, "salary-set", "payroll", person.id, { name: person.name, from: b.month, amount: b.amount });
  send(res, { id: row.id, month: row.month, amount: num(row.amount) }, "Salary saved");
}));

// money given to a staff member: any amount, any time; it counts toward the month being looked at (this month or an earlier one)
payrollRouter.post("/staff/:id/pay", requirePermission("payroll.manage"), handler(async (req, res) => {
  const b = parse(z.object({ amount: money.refine((n) => n > 0, "Enter an amount"), month: monthParam, note: z.string().trim().max(200).nullish() }), req.body);
  if (b.month > thisMonth()) throw new AppError(400, "Pay toward this month or an earlier one");
  const person = await prisma.staffUser.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true } });
  if (!person) throw new AppError(404, "Staff member not found");
  const row = await prisma.staffPayment.create({ data: { staffId: person.id, month: b.month, amount: b.amount, note: b.note || null, paidById: req.staff!.id, paidByName: req.staff!.name } });
  await audit(req, "pay", "payroll", person.id, { name: person.name, month: b.month, amount: b.amount });
  send(res, { id: row.id }, "Payment saved", 201);
}));

// one person: month by month (newest first) and the payments made
payrollRouter.get("/staff/:id/history", requirePermission("payroll.view"), handler(async (req, res) => {
  const person = await prisma.staffUser.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true, email: true, role: true } });
  if (!person) throw new AppError(404, "Staff member not found");
  const [salaries, payments] = await Promise.all([
    prisma.staffSalary.findMany({ where: { staffId: person.id } }),
    prisma.staffPayment.findMany({ where: { staffId: person.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const sal = moneyRows(salaries);
  const pay = moneyRows(payments);
  const start = [...sal.map((s) => s.month), ...pay.map((p) => p.month)].sort()[0] ?? thisMonth();
  const months: { month: string; salary: number | null; previousDues: number; paid: number; remaining: number }[] = [];
  for (let k = start, n = 0; k <= thisMonth() && n < 600; k = nextMonth(k), n++) months.push({ month: k, ...figures(sal, pay, k) });
  months.reverse();
  send(res, {
    staff: person, months,
    payments: payments.slice(0, 60).map((p) => ({ id: p.id, month: p.month, amount: num(p.amount), note: p.note, paidByName: p.paidByName, createdAt: p.createdAt })),
  });
}));

// undo a payment that was entered by mistake
payrollRouter.delete("/payments/:pid", requirePermission("payroll.manage"), handler(async (req, res) => {
  const p = await prisma.staffPayment.findUnique({ where: { id: param(req, "pid") } });
  if (!p) throw new AppError(404, "Payment not found");
  await prisma.staffPayment.delete({ where: { id: p.id } });
  await audit(req, "pay-undo", "payroll", p.staffId, { month: p.month, amount: num(p.amount) });
  send(res, { id: p.id }, "Payment removed");
}));
