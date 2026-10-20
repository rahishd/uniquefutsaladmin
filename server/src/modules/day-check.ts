// The owner's daily check: look at the day's dashboard, say how much money was really received, and mark the day as checked.
// What the portal counted (cash and Fonepay) is saved with the check, so a later change to the day shows up as a warning, not silently.
// Owner only (the same permission that adds staff accounts).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { buildReport } from "./inventory-report";

export const dayCheckRouter = Router();
dayCheckRouter.use(requirePermission("staff.manage"));

const HISTORY_DAYS = 14;

async function figures(day: string) {
  const r = await buildReport(day, day);
  return {
    cash: r.totals.cash, fonepay: r.totals.fonepay, total: r.totals.total, bySource: r.totals.bySource,
    games: r.games.count, gamesPaid: r.games.paidCount, gamezone: r.gamezone.count, itemsSold: r.itemsSold.reduce((n, i) => n + i.qty, 0),
    dueAmount: r.dues.amount, dueCount: r.dues.count,
  };
}

const shape = (c: { day: string; expectedCash: number; expectedFonepay: number; receivedCash: number; receivedFonepay: number; note: string | null; checkedByName: string; checkedAt: Date }) => ({
  day: c.day, expectedCash: c.expectedCash, expectedFonepay: c.expectedFonepay, receivedCash: c.receivedCash, receivedFonepay: c.receivedFonepay,
  differenceCash: c.receivedCash - c.expectedCash, differenceFonepay: c.receivedFonepay - c.expectedFonepay,
  difference: c.receivedCash + c.receivedFonepay - c.expectedCash - c.expectedFonepay,
  note: c.note, checkedByName: c.checkedByName, checkedAt: c.checkedAt,
});

const pastOrToday = (day: string) => {
  const today = todayKey();
  if (day > today) throw new AppError(400, "Pick today or an earlier day");
  if (day < addDaysKey(today, -366)) throw new AppError(400, "Pick a day within the last year");
};

// One day: the portal's figures, and the check if the owner already made one. Also the last two weeks at a glance.
dayCheckRouter.get("/", handler(async (req, res) => {
  const day = parse(z.object({ date: dateStr.optional() }), req.query).date ?? todayKey();
  pastOrToday(day);
  const [now, check, recent] = await Promise.all([
    figures(day),
    prisma.dayCheck.findUnique({ where: { day } }),
    prisma.dayCheck.findMany({ where: { day: { gte: addDaysKey(todayKey(), -(HISTORY_DAYS - 1)) } } }),
  ]);
  const byDay = new Map(recent.map((c) => [c.day, c]));
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => addDaysKey(todayKey(), -i)).map((d) => {
    const c = byDay.get(d);
    return { day: d, checked: !!c, difference: c ? c.receivedCash + c.receivedFonepay - c.expectedCash - c.expectedFonepay : null, checkedByName: c?.checkedByName ?? null };
  });
  send(res, {
    date: day, figures: now, check: check ? shape(check) : null,
    // the day's takings moved after it was checked (a late payment, a correction): the owner should look again
    changedSinceCheck: check ? Math.abs(check.expectedCash - now.cash) > 0.5 || Math.abs(check.expectedFonepay - now.fonepay) > 0.5 : false,
    history,
  });
}));

// Mark a day as checked, with the amounts the owner received. One check per day; reopen it to change it.
dayCheckRouter.post("/", handler(async (req, res) => {
  const b = parse(z.object({
    date: dateStr, receivedCash: z.number().min(0).max(100_000_000), receivedFonepay: z.number().min(0).max(100_000_000), note: z.string().trim().max(500).nullish(),
  }), req.body);
  pastOrToday(b.date);
  if (await prisma.dayCheck.findUnique({ where: { day: b.date }, select: { id: true } })) throw new AppError(409, "This day is already checked. Reopen it to change it.");
  const f = await figures(b.date);
  const c = await prisma.dayCheck.create({
    data: { day: b.date, expectedCash: f.cash, expectedFonepay: f.fonepay, receivedCash: b.receivedCash, receivedFonepay: b.receivedFonepay, note: b.note || null, checkedById: req.staff!.id, checkedByName: req.staff!.name },
  });
  await audit(req, "check", "day-check", c.day, { expected: f.total, received: b.receivedCash + b.receivedFonepay });
  send(res, shape(c), "Day checked", 201);
}));

// Reopen a checked day (the owner made a mistake, or the day changed). The old check is removed and the audit log keeps the record of it.
dayCheckRouter.delete("/:date", handler(async (req, res) => {
  const day = parse(dateStr, req.params.date);
  const c = await prisma.dayCheck.findUnique({ where: { day } });
  if (!c) throw new AppError(404, "This day has no check to reopen");
  await prisma.dayCheck.delete({ where: { id: c.id } });
  await audit(req, "reopen", "day-check", day, shape(c));
  send(res, { day }, "Day reopened");
}));
