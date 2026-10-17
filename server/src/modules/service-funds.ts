// Collect Service Payment: money that is set aside for a purpose, kept apart from the day's takings.
//   - "percent" funds (the 3% Charity Fund ...) collect AUTOMATICALLY from every futsal game: a share of what the customer paid
//     for the court. Add-ons (goods), Gamezone, memberships, the club, tournaments and Gift Card points are not part of it.
//     Each day's share is deposited by itself (one automatic deposit per fund per day). Today's deposit follows today's games
//     until midnight; a past day is never changed.
//   - "manual" funds (maintenance, balls, anything) have no rate: staff record what was set aside.
//   - Money can be withdrawn from a fund (never more than its balance): balance = deposited - withdrawn.
// Deposits and withdrawals are written once and never edited or deleted, so the history can be screened later.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { dateStr, AppError, handler, page, param, parse, send } from "../lib/http";
import { addDaysKey, todayKey } from "../lib/dates";
import { requirePermission } from "../middleware/auth";
import { NOT_LEDGER } from "./bookings";

export const serviceFundsRouter = Router();

const DEAD = ["cancelled", "expired"];
const round2 = (n: number) => Math.round(n * 100) / 100;

const range = z.object({ from: dateStr.optional(), to: dateStr.optional() });
const dayRange = (from?: string, to?: string) => (from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined);

const paidGames = (day?: { gte?: string; lte?: string }): Prisma.BookingWhereInput => ({
  AND: [NOT_LEDGER, { paymentStatus: "completed", status: { notIn: DEAD } }, ...(day ? [{ date: day }] : [])],
});

/** Futsal games only: what customers paid for the court, without the add-ons. This is what percent funds are worked out from. */
export async function gamesBase(from?: string, to?: string) {
  const a = await prisma.booking.aggregate({ where: paidGames(dayRange(from, to)), _sum: { totalPrice: true, addOnsPrice: true }, _count: { _all: true } });
  return { base: Math.max(0, Math.round((a._sum.totalPrice ?? 0) - (a._sum.addOnsPrice ?? 0))), games: a._count._all };
}

/** The same, one row per day. */
async function dailyBase(from: string, to: string) {
  const rows = await prisma.booking.groupBy({ by: ["date"], where: paidGames({ gte: from, lte: to }), _sum: { totalPrice: true, addOnsPrice: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.date, { base: Math.max(0, Math.round((r._sum.totalPrice ?? 0) - (r._sum.addOnsPrice ?? 0))), games: r._count._all }]));
}

/** Everything customers paid in the period (for information: the page shows what makes up the takings). */
export async function takings(from?: string, to?: string) {
  const day = dayRange(from, to);
  const at = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00+05:45`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999+05:45`) } : {}) } : undefined;
  const [courts, members, gamezone, club, tournaments, gifts] = await Promise.all([
    prisma.booking.aggregate({ where: paidGames(day), _sum: { totalPrice: true } }),
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

// The Charity Fund exists from the start (3% of the games, as the customer app shows on every bill).
async function ensureDefaults() {
  const have = await prisma.serviceFund.count();
  if (have === 0) await prisma.serviceFund.create({ data: { name: "Charity Fund", kind: "percent", rate: 3, sortOrder: 0, autoSince: todayKey(), createdBy: "system" } });
}

/**
 * Automatic deposits. For every switched-on percent fund, each day from its start day to today gets one deposit: the fund's share
 * of that day's futsal games. A missing day is filled in; TODAY's deposit is updated to match today's games; earlier days are left alone.
 * Safe to run any number of times (and at the same time): one row per fund per day.
 */
export async function syncAutoDeposits() {
  const today = todayKey();
  const funds = await prisma.serviceFund.findMany({ where: { kind: "percent", active: true } });
  for (const f of funds) {
    const since = f.autoSince ?? today;
    if (!f.autoSince) await prisma.serviceFund.update({ where: { id: f.id }, data: { autoSince: since } });
    const rate = f.rate ?? 0;
    const days = await dailyBase(since, today);
    const have = new Set((await prisma.serviceDeposit.findMany({ where: { fundId: f.id, autoDay: { not: null } }, select: { autoDay: true } })).map((d) => d.autoDay));
    const share = (d: string) => { const v = days.get(d); return v ? round2((v.base * rate) / 100) : 0; };
    const note = (d: string) => { const v = days.get(d); return v ? `Automatic: ${rate}% of ${v.games} ${v.games === 1 ? "game" : "games"} (Rs. ${v.base})` : "Automatic"; };
    const make = [...days.keys()].filter((d) => !have.has(d) && share(d) > 0)
      .map((d) => ({ fundId: f.id, amount: share(d), note: note(d), depositedOn: d, autoDay: d, createdBy: "system", createdByName: "Automatic" }));
    if (make.length) await prisma.serviceDeposit.createMany({ data: make, skipDuplicates: true });
    if (have.has(today)) await prisma.serviceDeposit.updateMany({ where: { fundId: f.id, autoDay: today }, data: { amount: share(today), note: note(today) } });
  }
}

const sumBy = async <T extends { fundId: string; _sum: { amount: number | null } }>(rows: T[]) => new Map(rows.map((r) => [r.fundId, round2(r._sum.amount ?? 0)]));

serviceFundsRouter.get("/", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(range, req.query);
  await ensureDefaults();
  await syncAutoDeposits();
  const today = todayKey();
  const depIn = f.from || f.to ? { depositedOn: dayRange(f.from, f.to) } : {};
  const wdIn = f.from || f.to ? { withdrawnOn: dayRange(f.from, f.to) } : {};
  const [funds, base, games, depPeriod, depAll, depToday, depManual, wdPeriod, wdAll, lastDep] = await Promise.all([
    prisma.serviceFund.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    takings(f.from, f.to),
    gamesBase(f.from, f.to),
    prisma.serviceDeposit.groupBy({ by: ["fundId"], where: depIn, _sum: { amount: true }, _count: { _all: true }, _max: { depositedOn: true } }),
    prisma.serviceDeposit.groupBy({ by: ["fundId"], _sum: { amount: true } }),
    prisma.serviceDeposit.groupBy({ by: ["fundId"], where: { depositedOn: today }, _sum: { amount: true } }),
    prisma.serviceDeposit.groupBy({ by: ["fundId"], where: { autoDay: null }, _sum: { amount: true } }),
    prisma.serviceWithdrawal.groupBy({ by: ["fundId"], where: wdIn, _sum: { amount: true } }),
    prisma.serviceWithdrawal.groupBy({ by: ["fundId"], _sum: { amount: true } }),
    prisma.serviceDeposit.groupBy({ by: ["fundId"], _max: { depositedOn: true } }),
  ]);
  const [mDepAll, mToday, mManual, mWdPeriod, mWdAll] = await Promise.all([sumBy(depAll), sumBy(depToday), sumBy(depManual), sumBy(wdPeriod), sumBy(wdAll)]);
  const period = new Map(depPeriod.map((s) => [s.fundId, s]));
  const last = new Map(lastDep.map((s) => [s.fundId, s._max.depositedOn]));

  const items = await Promise.all(funds.map(async (fund) => {
    const p = period.get(fund.id);
    const depositedAll = mDepAll.get(fund.id) ?? 0;
    const withdrawnAll = mWdAll.get(fund.id) ?? 0;
    // days before automatic collection began: what was owed then and has not been deposited by hand
    let toDeposit: number | null = null;
    if (fund.kind === "percent") {
      const before = fund.autoSince ? await gamesBase(undefined, addDaysKey(fund.autoSince, -1)) : { base: 0, games: 0 };
      toDeposit = round2(Math.max(0, (before.base * (fund.rate ?? 0)) / 100 - (mManual.get(fund.id) ?? 0)));
    }
    return {
      id: fund.id, name: fund.name, kind: fund.kind, rate: fund.rate, defaultAmount: fund.defaultAmount, active: fund.active, note: fund.note, autoSince: fund.autoSince,
      receivedToday: mToday.get(fund.id) ?? 0, // deposited today (automatic or by hand)
      received: round2(p?._sum.amount ?? 0), deposits: p?._count._all ?? 0, lastDeposit: last.get(fund.id) ?? null, // in the chosen period
      withdrawn: mWdPeriod.get(fund.id) ?? 0, // in the chosen period
      depositedAll, withdrawnAll, balance: round2(depositedAll - withdrawnAll), // all time: what is in the fund now
      toDeposit, // percent funds: owed from before automatic collection started, not yet deposited by hand
    };
  }));
  const sum = (pick: (i: (typeof items)[number]) => number) => round2(items.reduce((n, i) => n + pick(i), 0));
  send(res, {
    today, base: { ...base, games: games.base, gamesCount: games.games }, from: f.from ?? null, to: f.to ?? null,
    totals: { receivedToday: sum((i) => i.receivedToday), received: sum((i) => i.received), withdrawn: sum((i) => i.withdrawn), balance: sum((i) => i.balance), toDeposit: sum((i) => i.toDeposit ?? 0) },
    items,
  });
}));

// ---- the daily collection: one row per day with the games paid and each percent fund's share ----
serviceFundsRouter.get("/collections", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(range, req.query);
  await ensureDefaults();
  await syncAutoDeposits();
  const to = f.to ?? todayKey();
  const from = f.from ?? addDaysKey(to, -29);
  if (from > to) throw new AppError(400, "From must be before To");
  if (addDaysKey(from, 366) < to) throw new AppError(400, "Pick one year or less");
  const [days, funds, autos] = await Promise.all([
    dailyBase(from, to),
    prisma.serviceFund.findMany({ where: { kind: "percent" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, rate: true } }),
    prisma.serviceDeposit.findMany({ where: { autoDay: { not: null }, depositedOn: { gte: from, lte: to } }, select: { fundId: true, autoDay: true, amount: true } }),
  ]);
  const share = new Map(autos.map((a) => [`${a.autoDay}|${a.fundId}`, a.amount]));
  const rows = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({
    date, games: v.games, base: v.base, funds: funds.map((fd) => ({ fundId: fd.id, amount: round2(share.get(`${date}|${fd.id}`) ?? 0) })),
  }));
  send(res, {
    from, to, funds,
    days: rows,
    totals: { games: rows.reduce((n, r) => n + r.games, 0), base: rows.reduce((n, r) => n + r.base, 0), funds: funds.map((fd, i) => ({ fundId: fd.id, amount: round2(rows.reduce((n, r) => n + r.funds[i].amount, 0)) })) },
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
  if (b.kind === "percent" && !b.rate) throw new AppError(400, "Set the percentage of each game, for example 2");
  if (await prisma.serviceFund.findFirst({ where: { name: { equals: b.name, mode: "insensitive" } } })) throw new AppError(409, "A service with this name already exists");
  const last = await prisma.serviceFund.findFirst({ orderBy: { sortOrder: "desc" } });
  const row = await prisma.serviceFund.create({
    data: { name: b.name, kind: b.kind, rate: b.kind === "percent" ? b.rate : null, defaultAmount: b.defaultAmount ?? null, note: b.note ?? null, sortOrder: (last?.sortOrder ?? 0) + 1, autoSince: b.kind === "percent" ? todayKey() : null, createdBy: req.staff!.id },
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
      // switched back on: it collects from today, not for the days it was off
      ...(b.active === true && !cur.active && cur.kind === "percent" ? { autoSince: todayKey() } : {}),
    },
  });
  await audit(req, "service-fund-edit", "service-fund", row.id, { from: { name: cur.name, rate: cur.rate, active: cur.active }, to: { name: row.name, rate: row.rate, active: row.active } });
  send(res, row, "Service saved");
}));

// "Deposit Amount" by hand (manual services, or money owed from before automatic collection). Written once, never changed.
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

// "Withdraw": money taken out of a fund. The reason is required, and never more than the balance.
const withdrawBody = z.object({ amount: z.number().positive().max(100_000_000), note: z.string().trim().min(3, "Say what the money is for").max(300), date: dateStr.optional() });

serviceFundsRouter.post("/funds/:id/withdraw", requirePermission("servicefunds.withdraw"), handler(async (req, res) => {
  const b = parse(withdrawBody, req.body);
  const fund = await prisma.serviceFund.findUnique({ where: { id: param(req, "id") } });
  if (!fund) throw new AppError(404, "Service not found");
  await syncAutoDeposits(); // so today's automatic share is in the balance
  const today = todayKey();
  const date = b.date ?? today;
  if (date > today) throw new AppError(400, "The withdrawal date cannot be in the future");
  const amount = round2(b.amount);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fund.id}))`; // two withdrawals at once cannot both pass the balance check
    const [dep, wd] = await Promise.all([
      tx.serviceDeposit.aggregate({ where: { fundId: fund.id }, _sum: { amount: true } }),
      tx.serviceWithdrawal.aggregate({ where: { fundId: fund.id }, _sum: { amount: true } }),
    ]);
    const balance = round2((dep._sum.amount ?? 0) - (wd._sum.amount ?? 0));
    if (amount > balance) throw new AppError(409, `Only Rs. ${balance} is in ${fund.name}. You cannot withdraw more than that.`);
    return tx.serviceWithdrawal.create({ data: { fundId: fund.id, amount, note: b.note, withdrawnOn: date, createdBy: req.staff!.id, createdByName: req.staff!.name ?? "Staff" } });
  });
  await audit(req, "service-fund-withdraw", "service-fund", fund.id, { fund: fund.name, amount, date, note: b.note, withdrawal: row.id });
  send(res, row, `Rs. ${amount} withdrawn from ${fund.name}`, 201);
}));

const listQuery = range.extend({ fundId: z.string().optional(), q: z.string().trim().max(60).optional(), type: z.enum(["deposit", "withdrawal"]).optional() });

// Deposits only (older screen and exports).
serviceFundsRouter.get("/deposits", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(listQuery, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const where: Prisma.ServiceDepositWhereInput = {
    ...(f.fundId ? { fundId: f.fundId } : {}),
    ...(f.from || f.to ? { depositedOn: dayRange(f.from, f.to) } : {}),
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
    items: rows.map((d) => ({ id: d.id, fundId: d.fundId, fund: name.get(d.fundId) ?? "Service", amount: d.amount, note: d.note, date: d.depositedOn, by: d.createdByName, at: d.createdAt, auto: d.autoDay !== null })),
  });
}));

// The history: deposits (received) and withdrawals together, newest first.
serviceFundsRouter.get("/ledger", requirePermission("servicefunds.view"), handler(async (req, res) => {
  const f = parse(listQuery, req.query);
  const { take, skip, pageNo, limit } = page(req.query as Record<string, unknown>);
  const text = (fields: string[]) => (f.q ? { OR: fields.map((k) => ({ [k]: { contains: f.q, mode: "insensitive" as const } })) } : {});
  const depWhere: Prisma.ServiceDepositWhereInput = { ...(f.fundId ? { fundId: f.fundId } : {}), ...(f.from || f.to ? { depositedOn: dayRange(f.from, f.to) } : {}), ...text(["note", "createdByName"]) };
  const wdWhere: Prisma.ServiceWithdrawalWhereInput = { ...(f.fundId ? { fundId: f.fundId } : {}), ...(f.from || f.to ? { withdrawnOn: dayRange(f.from, f.to) } : {}), ...text(["note", "createdByName"]) };
  const wantDep = f.type !== "withdrawal";
  const wantWd = f.type !== "deposit";
  const [deps, wds, depCount, wdCount, depSum, wdSum, funds] = await Promise.all([
    wantDep ? prisma.serviceDeposit.findMany({ where: depWhere, orderBy: [{ depositedOn: "desc" }, { createdAt: "desc" }], take: skip + take }) : [],
    wantWd ? prisma.serviceWithdrawal.findMany({ where: wdWhere, orderBy: [{ withdrawnOn: "desc" }, { createdAt: "desc" }], take: skip + take }) : [],
    wantDep ? prisma.serviceDeposit.count({ where: depWhere }) : 0,
    wantWd ? prisma.serviceWithdrawal.count({ where: wdWhere }) : 0,
    wantDep ? prisma.serviceDeposit.aggregate({ where: depWhere, _sum: { amount: true } }) : null,
    wantWd ? prisma.serviceWithdrawal.aggregate({ where: wdWhere, _sum: { amount: true } }) : null,
    prisma.serviceFund.findMany({ select: { id: true, name: true } }),
  ]);
  const name = new Map(funds.map((x) => [x.id, x.name]));
  const all = [
    ...deps.map((d) => ({ id: d.id, type: "deposit" as const, fundId: d.fundId, fund: name.get(d.fundId) ?? "Service", amount: d.amount, note: d.note, date: d.depositedOn, by: d.createdByName, at: d.createdAt, auto: d.autoDay !== null })),
    ...wds.map((w) => ({ id: w.id, type: "withdrawal" as const, fundId: w.fundId, fund: name.get(w.fundId) ?? "Service", amount: w.amount, note: w.note, date: w.withdrawnOn, by: w.createdByName, at: w.createdAt, auto: false })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.getTime() - a.at.getTime());
  send(res, {
    total: depCount + wdCount, page: pageNo, limit,
    received: round2(depSum?._sum.amount ?? 0), withdrawn: round2(wdSum?._sum.amount ?? 0),
    items: all.slice(skip, skip + take),
  });
}));
