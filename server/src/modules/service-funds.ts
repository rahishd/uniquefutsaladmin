// Collect Service Payment: money that is set aside for a purpose, kept apart from the day's takings.
//   - "percent" funds grow with the takings: the 3% Charity Fund is 3% of what customers paid for games, Gamezone,
//     memberships, the club, hosted tournaments and Gift Card points. What is still to be set aside = accrued - deposited.
//   - "manual" funds (maintenance, balls, anything) have no rate: staff just record what was set aside.
// A deposit is written once and never edited or deleted, so the history can be screened later.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { dateStr, AppError, handler, page, param, parse, send } from "../lib/http";
import { todayKey } from "../lib/dates";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";

export const serviceFundsRouter = Router();

const DEAD = ["cancelled", "expired"];
const round2 = (n: number) => Math.round(n * 100) / 100;

const range = z.object({ from: dateStr.optional(), to: dateStr.optional() });

/** What customers paid in the period: the base the percent funds are worked out from. */
export async function takings(from?: string, to?: string) {
  const day = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const at = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00+05:45`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999+05:45`) } : {}) } : undefined;
  const [courts, members, gamezone, club, tournaments, gifts] = await Promise.all([
    prisma.booking.aggregate({ where: { AND: [NOT_LEDGER, { paymentStatus: "completed", status: { notIn: DEAD } }, ...(day ? [{ date: day }] : [])] }, _sum: { totalPrice: true } }),
    prisma.booking.aggregate({ where: { notes: { contains: "MEMBERSHIP_PAYMENT" }, paymentStatus: "completed", status: { notIn: DEAD }, ...(day ? { date: day } : {}) }, _sum: { totalPrice: true } }),
    prisma.gzBooking.aggregate({ where: { paymentStatus: "paid", status: { notIn: DEAD }, ...(day ? { date: day } : {}) }, _sum: { total: true } }),
    prisma.paymentOrder.aggregate({ where: { purpose: "club", status: "paid", ...(at ? { paidAt: at } : {}) }, _sum: { amount: true } }),
    prisma.tournamentPayment.aggregate({ where: at ? { createdAt: at } : {}, _sum: { cash: true, fonepay: true } }),
    prisma.paymentOrder.aggregate({ where: { purpose: "gift_points", status: "paid", ...(at ? { paidAt: at } : {}) }, _sum: { amount: true } }),
  ]);
  const parts = {
    courts: Math.round(courts._sum.totalPrice ?? 0),
    memberships: Math.round(members._sum.totalPrice ?? 0),
    gamezone: gamezone._sum.total ?? 0,
    club: club._sum.amount ?? 0,
    tournaments: (tournaments._sum.cash ?? 0) + (tournaments._sum.fonepay ?? 0),
    giftCards: gifts._sum.amount ?? 0,
  };
  return { ...parts, total: parts.courts + parts.memberships + parts.gamezone + parts.club + parts.tournaments + parts.giftCards };
}

// The Charity Fund exists from the start (3% of the takings, as the customer app shows on every bill).
async function ensureDefaults() {
  const have = await prisma.serviceFund.count();
  if (have === 0) await prisma.serviceFund.create({ data: { name: "Charity Fund", kind: "percent", rate: 3, sortOrder: 0, createdBy: "system" } });
}

serviceFundsRouter.get("/", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(range, req.query);
  await ensureDefaults();
  const [funds, base, sums] = await Promise.all([
    prisma.serviceFund.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    takings(f.from, f.to),
    prisma.serviceDeposit.groupBy({
      by: ["fundId"], _sum: { amount: true }, _count: { _all: true }, _max: { depositedOn: true },
      where: f.from || f.to ? { depositedOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {},
    }),
  ]);
  // deposits made so far, in total (a percent fund's balance compares the whole history, not only this period)
  const allTime = await prisma.serviceDeposit.groupBy({ by: ["fundId"], _sum: { amount: true } });
  const sum = new Map(sums.map((s) => [s.fundId, s]));
  const total = new Map(allTime.map((s) => [s.fundId, s._sum.amount ?? 0]));
  const baseAll = f.from || f.to ? await takings() : base;

  const items = funds.map((fund) => {
    const s = sum.get(fund.id);
    const accrued = fund.kind === "percent" ? round2((base.total * (fund.rate ?? 0)) / 100) : null;
    const accruedAll = fund.kind === "percent" ? round2((baseAll.total * (fund.rate ?? 0)) / 100) : null;
    const depositedAll = round2(total.get(fund.id) ?? 0);
    return {
      id: fund.id, name: fund.name, kind: fund.kind, rate: fund.rate, defaultAmount: fund.defaultAmount, active: fund.active, note: fund.note,
      accrued, // in the chosen period
      deposited: round2(s?._sum.amount ?? 0), deposits: s?._count._all ?? 0, lastDeposit: s?._max.depositedOn ?? null, // in the chosen period
      depositedAll,
      toDeposit: accruedAll === null ? null : round2(Math.max(0, accruedAll - depositedAll)), // everything still to be set aside
    };
  });
  send(res, {
    base, from: f.from ?? null, to: f.to ?? null,
    totals: { deposited: round2(items.reduce((n, i) => n + i.deposited, 0)), toDeposit: round2(items.reduce((n, i) => n + (i.toDeposit ?? 0), 0)) },
    items,
  });
}));

const fundBody = z.object({
  name: z.string().trim().min(2).max(40),
  kind: z.enum(["percent", "manual"]),
  rate: z.number().min(0.1).max(100).optional(),
  defaultAmount: z.number().int().min(1).max(10_000_000).optional(),
  note: z.string().trim().max(200).optional(),
});

serviceFundsRouter.post("/funds", requirePermission("servicefunds.manage"), handler(async (req, res) => {
  const b = parse(fundBody, req.body);
  if (b.kind === "percent" && !b.rate) throw new AppError(400, "Set the percentage of the takings, for example 2");
  if (await prisma.serviceFund.findFirst({ where: { name: { equals: b.name, mode: "insensitive" } } })) throw new AppError(409, "A service with this name already exists");
  const last = await prisma.serviceFund.findFirst({ orderBy: { sortOrder: "desc" } });
  const row = await prisma.serviceFund.create({
    data: { name: b.name, kind: b.kind, rate: b.kind === "percent" ? b.rate : null, defaultAmount: b.defaultAmount ?? null, note: b.note ?? null, sortOrder: (last?.sortOrder ?? 0) + 1, createdBy: req.staff!.id },
  });
  await audit(req, "service-fund-create", "service-fund", row.id, { name: row.name, kind: row.kind, rate: row.rate });
  send(res, row, "Service added", 201);
}));

serviceFundsRouter.patch("/funds/:id", requirePermission("servicefunds.manage"), handler(async (req, res) => {
  const b = parse(fundBody.partial().extend({ active: z.boolean().optional() }), req.body);
  const cur = await prisma.serviceFund.findUnique({ where: { id: param(req, "id") } });
  if (!cur) throw new AppError(404, "Service not found");
  if (b.name && b.name.toLowerCase() !== cur.name.toLowerCase() && (await prisma.serviceFund.findFirst({ where: { name: { equals: b.name, mode: "insensitive" } } }))) throw new AppError(409, "A service with this name already exists");
  const row = await prisma.serviceFund.update({
    where: { id: cur.id },
    data: {
      ...(b.name ? { name: b.name } : {}),
      ...(b.rate !== undefined && cur.kind === "percent" ? { rate: b.rate } : {}),
      ...(b.defaultAmount !== undefined ? { defaultAmount: b.defaultAmount } : {}),
      ...(b.note !== undefined ? { note: b.note || null } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    },
  });
  await audit(req, "service-fund-edit", "service-fund", row.id, { from: { name: cur.name, rate: cur.rate, active: cur.active }, to: { name: row.name, rate: row.rate, active: row.active } });
  send(res, row, "Service saved");
}));

// "Deposit Amount": the money has been set aside. Written once; it can be read for ever, never changed.
const depositBody = z.object({ amount: z.number().positive().max(100_000_000), note: z.string().trim().max(300).optional(), date: dateStr.optional() });

serviceFundsRouter.post("/funds/:id/deposit", requirePermission("servicefunds.deposit"), handler(async (req, res) => {
  const b = parse(depositBody, req.body);
  const fund = await prisma.serviceFund.findUnique({ where: { id: param(req, "id") } });
  if (!fund) throw new AppError(404, "Service not found");
  if (!fund.active) throw new AppError(409, "This service is switched off. Switch it on to deposit.");
  const today = todayKey();
  const date = b.date ?? today;
  if (date > today) throw new AppError(400, "The deposit date cannot be in the future");
  const row = await prisma.serviceDeposit.create({
    data: { fundId: fund.id, amount: round2(b.amount), note: b.note ?? null, depositedOn: date, createdBy: req.staff!.id, createdByName: req.staff!.name ?? "Staff" },
  });
  await audit(req, "service-fund-deposit", "service-fund", fund.id, { fund: fund.name, amount: row.amount, date, deposit: row.id });
  send(res, row, `Rs. ${row.amount} deposited to ${fund.name}`, 201);
}));

const listQuery = range.extend({ fundId: z.string().optional(), q: z.string().trim().max(60).optional() });

serviceFundsRouter.get("/deposits", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(listQuery, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const where: Prisma.ServiceDepositWhereInput = {
    ...(f.fundId ? { fundId: f.fundId } : {}),
    ...(f.from || f.to ? { depositedOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q ? { OR: [{ note: { contains: f.q, mode: "insensitive" } }, { createdByName: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, sum, funds] = await Promise.all([
    prisma.serviceDeposit.findMany({ where, orderBy: [{ depositedOn: "desc" }, { createdAt: "desc" }], take, skip }),
    prisma.serviceDeposit.count({ where }),
    prisma.serviceDeposit.aggregate({ where, _sum: { amount: true } }),
    prisma.serviceFund.findMany({ select: { id: true, name: true } }),
  ]);
  const name = new Map(funds.map((x) => [x.id, x.name]));
  send(res, {
    total, page: pageNo, limit, sum: round2(sum._sum.amount ?? 0),
    items: rows.map((d) => ({ id: d.id, fundId: d.fundId, fund: name.get(d.fundId) ?? "Service", amount: d.amount, note: d.note, date: d.depositedOn, by: d.createdByName, at: d.createdAt })),
  });
}));
