// Tournaments the venue HOSTS for a manager: the details, the days and hours the court is held, the goods taken during the event,
// extra charges and discounts, the payments received, and the final bill.
//   - Hosting holds the court: every hour of every chosen day becomes a staff block (SlotBlock + BookingSlot "block:<id>"), the same guard
//     the Slots page uses, so nobody can book those hours in the app or at the desk.
//   - The court charge is hours x the agreed hourly rate (minRate). Goods come from the shop stock and are written to the stock log with the
//     reason "Tournament #id", WITHOUT cash or online amounts, so the shop sales totals do not count them: the money is the tournament payments.
//   - Payments are cash and/or a paid Fonepay QR, the same rules as every other bill.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { addDaysKey, currentHour, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { memberHolds } from "../lib/member-holds";
import { claimFonepay, buildGoods, paysSchema, PAY_METHODS, resolvePays } from "../lib/settle";
import { requirePermission } from "../middleware/auth";

export const tournamentEventsRouter = Router();

const phone = z.string().trim().regex(/^\+?\d[\d\s-]{6,16}$/, "Enter a phone number, digits only");
const dayBody = z.object({ date: dateStr, startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24) })
  .refine((d) => d.endHour > d.startHour, { message: "The end time must be after the start time", path: ["endHour"] });
const createBody = z.object({
  name: z.string().trim().min(2, "Enter the event name").max(80),
  hostName: z.string().trim().min(2, "Enter the host or manager name").max(60),
  hostPhone: phone,
  minRate: z.number().int("Whole rupees only").min(100, "At least Rs. 100 an hour").max(100_000),
  days: z.array(dayBody).min(1, "Choose at least one day").max(21, "At most 21 days"),
  dryRun: z.boolean().default(false),
});

const hoursOf = (d: { startHour: number; endHour: number }) => d.endHour - d.startHour;
const h12 = (h: number) => `${h % 24 % 12 || 12}:00 ${h % 24 < 12 ? "AM" : "PM"}`;
const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type Clash = { date: string; hour: number; reason: string };
// Which of the wanted hours are already taken: a booking, a block, or a member's fixed hour
async function clashes(days: { date: string; startHour: number; endHour: number }[]): Promise<Clash[]> {
  const out: Clash[] = [];
  const dates = days.map((d) => d.date);
  const slots = await prisma.bookingSlot.findMany({ where: { date: { in: dates } } });
  const codes = new Map((await prisma.booking.findMany({ where: { id: { in: slots.filter((s) => !s.bookingId.startsWith("block:")).map((s) => s.bookingId) } }, select: { id: true, code: true, customerName: true } })).map((b) => [b.id, b]));
  const reasons = new Map((await prisma.slotBlock.findMany({ where: { id: { in: slots.filter((s) => s.bookingId.startsWith("block:")).map((s) => s.bookingId.slice(6)) } }, select: { id: true, reason: true } })).map((b) => [b.id, b.reason]));
  for (const d of days) {
    for (let h = d.startHour; h < d.endHour; h++) {
      const s = slots.find((x) => x.date === d.date && x.hour === h);
      if (s) out.push({ date: d.date, hour: h, reason: s.bookingId.startsWith("block:") ? `blocked: ${reasons.get(s.bookingId.slice(6)) ?? "by staff"}` : `booked by ${codes.get(s.bookingId)?.customerName ?? "a customer"} (${codes.get(s.bookingId)?.code ?? "booking"})` });
      else for (const m of await memberHolds([d.date], [h])) out.push({ date: d.date, hour: h, reason: `held for member ${m.name ?? m.userId}` });
    }
  }
  return out;
}

const lineView = (l: { id: string; kind: string; label: string; quantity: number; unitPrice: number; amount: number; createdAt: Date }) => ({ id: l.id, kind: l.kind, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, createdAt: l.createdAt });

// The whole bill of one hosted tournament
async function bill(id: string) {
  const t = await prisma.tournament.findUnique({ where: { id }, include: { days: { orderBy: { date: "asc" } }, billLines: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { createdAt: "asc" } } } });
  if (!t || !t.hostedEvent) throw new AppError(404, "Hosted tournament not found");
  const rate = t.minRate ?? 0;
  const hours = t.days.reduce((n, d) => n + hoursOf(d), 0);
  const court = hours * rate;
  const goods = t.billLines.filter((l) => l.kind === "goods").reduce((n, l) => n + l.amount, 0);
  const extras = t.billLines.filter((l) => l.kind === "extra").reduce((n, l) => n + l.amount, 0);
  const discount = -t.billLines.filter((l) => l.kind === "discount").reduce((n, l) => n + l.amount, 0);
  const total = court + goods + extras - discount;
  const cash = t.payments.reduce((n, p) => n + p.cash, 0);
  const fonepay = t.payments.reduce((n, p) => n + p.fonepay, 0);
  return {
    id: t.id, name: t.name, status: t.status, hostName: t.hostName, hostPhone: t.hostPhone, rate, closedAt: t.billClosedAt,
    days: t.days.map((d) => ({ id: d.id, date: d.date, startHour: d.startHour, endHour: d.endHour, hours: hoursOf(d), amount: hoursOf(d) * rate })),
    hours, court, goods, extras, discount, total, paid: cash + fonepay, paidCash: cash, paidFonepay: fonepay, due: total - cash - fonepay,
    lines: t.billLines.map(lineView),
    payments: t.payments.map((p) => ({ id: p.id, cash: p.cash, fonepay: p.fonepay, amount: p.cash + p.fonepay, note: p.note, createdAt: p.createdAt })),
  };
}
const refresh = async (id: string) => {
  const b = await bill(id);
  await prisma.tournament.update({ where: { id }, data: { totalAmount: b.total, paymentStatus: b.due <= 0 && b.total > 0 ? "paid" : b.paid > 0 ? "partial" : "unpaid" } });
  return b;
};
const open = async (id: string) => {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t || !t.hostedEvent) throw new AppError(404, "Hosted tournament not found");
  if (t.status === "cancelled") throw new AppError(409, "This tournament was cancelled");
  return t;
};
const editable = async (id: string) => {
  const t = await open(id);
  if (t.billClosedAt) throw new AppError(409, "The final bill was already made. Reopen it to change it.");
  return t;
};

// ---------- the list of hosted events with their money ----------
tournamentEventsRouter.get("/hosted", requirePermission("tournaments.view"), handler(async (_req, res) => {
  const rows = await prisma.tournament.findMany({ where: { hostedEvent: true, status: { not: "cancelled" } }, orderBy: { startDate: "desc" }, take: 100, select: { id: true } });
  send(res, await Promise.all(rows.map(async (r) => { const b = await bill(r.id); return { id: b.id, name: b.name, hostName: b.hostName, hostPhone: b.hostPhone, days: b.days.map((d) => ({ date: d.date, startHour: d.startHour, endHour: d.endHour })), hours: b.hours, total: b.total, paid: b.paid, due: b.due, closed: !!b.closedAt }; })));
}));

// ---------- register a hosted tournament (dryRun only checks) ----------
tournamentEventsRouter.post("/", requirePermission("tournaments.create"), handler(async (req, res) => {
  const b = parse(createBody, req.body);
  const today = todayKey();
  const seen = new Set<string>();
  for (const d of b.days) {
    if (seen.has(d.date)) throw new AppError(400, `${fmtDay(d.date)} is chosen twice. One time range per day.`);
    seen.add(d.date);
    if (d.date < today) throw new AppError(400, `${fmtDay(d.date)} is in the past`);
    if (d.date > addDaysKey(today, 180)) throw new AppError(400, "Pick days within the next 6 months");
    if (d.date === today && d.endHour <= currentHour()) throw new AppError(400, `Today's time ${h12(d.startHour)} to ${h12(d.endHour)} has already finished`);
  }
  const days = [...b.days].sort((a, c) => a.date.localeCompare(c.date));
  const hours = days.reduce((n, d) => n + hoursOf(d), 0);
  const clash = await clashes(days);
  const preview = { hours, court: hours * b.minRate, clashes: clash };
  if (b.dryRun) return send(res, preview);
  if (clash.length) throw new AppError(409, `${clash.length} of these hours are not free, for example ${fmtDay(clash[0].date)} ${h12(clash[0].hour)}: ${clash[0].reason}`);

  let created: string;
  try {
    created = await prisma.$transaction(async (tx) => {
      const t = await tx.tournament.create({
        data: { name: b.name, prizePool: 0, minTeams: 2, maxTeams: 16, startDate: days[0].date, endDate: days[days.length - 1].date, status: "active", isActive: true, totalAmount: hours * b.minRate, hostedEvent: true, hostName: b.hostName, hostPhone: b.hostPhone.replace(/\s|-/g, ""), minRate: b.minRate, createdBy: req.staff!.id },
      });
      for (const d of days) {
        const ids: string[] = [];
        for (let h = d.startHour; h < d.endHour; h++) {
          const blk = await tx.slotBlock.create({ data: { date: d.date, hour: h, reason: `Tournament: ${b.name}`, createdBy: req.staff!.id } });
          await tx.bookingSlot.create({ data: { date: d.date, hour: h, bookingId: `block:${blk.id}` } });
          ids.push(blk.id);
        }
        await tx.tournamentDay.create({ data: { tournamentId: t.id, date: d.date, startHour: d.startHour, endHour: d.endHour, blockIds: ids } });
      }
      return t.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "One of those hours was just taken. Check again.");
    throw e;
  }
  await audit(req, "host", "tournament", created, { name: b.name, host: b.hostName, days: days.map((d) => `${d.date} ${d.startHour}-${d.endHour}`), rate: b.minRate });
  send(res, await bill(created), "Tournament registered and the court is held", 201);
}));

tournamentEventsRouter.get("/:id/billing", requirePermission("tournaments.view"), handler(async (req, res) => send(res, await bill(param(req, "id")))));

// ---------- the agreed hourly rate ----------
tournamentEventsRouter.patch("/:id/rate", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  const { minRate } = parse(z.object({ minRate: z.number().int().min(100).max(100_000) }), req.body);
  const t = await editable(id);
  await prisma.tournament.update({ where: { id }, data: { minRate } });
  await audit(req, "rate", "tournament", id, { from: t.minRate, to: minRate });
  send(res, await refresh(id), "Rate saved");
}));

// ---------- goods taken from the shop while the tournament runs ----------
tournamentEventsRouter.post("/:id/items", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(10_000) })).min(1).max(30) }), req.body);
  const t = await editable(id);
  const merged = new Map<string, number>();
  for (const i of b.items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
  await prisma.$transaction(async (tx) => {
    const lines = await buildGoods(tx, merged); // locks the products, checks the stock, takes the price from the product
    for (const l of lines) {
      await tx.product.update({ where: { id: l.p.id }, data: { inventory: { decrement: l.qty } } });
      await tx.inventoryLog.create({ data: { productId: l.p.id, change: -l.qty, price: l.p.price, reason: `Tournament #${id}`, cashAmount: 0, onlineAmount: 0 } });
      await tx.tournamentBillLine.create({ data: { tournamentId: id, kind: "goods", label: l.p.name, productId: l.p.id, quantity: l.qty, unitPrice: Math.round(l.p.price), amount: l.amount, createdBy: req.staff!.id } });
    }
  });
  await audit(req, "add-items", "tournament", id, { name: t.name, items: b.items });
  send(res, await refresh(id), "Added to the bill", 201);
}));

// ---------- extra charges and discounts ----------
tournamentEventsRouter.post("/:id/lines", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ kind: z.enum(["extra", "discount"]), label: z.string().trim().min(2).max(80), amount: z.number().int().min(1).max(10_000_000) }), req.body);
  await editable(id);
  const now = await bill(id);
  if (b.kind === "discount" && b.amount > now.total) throw new AppError(400, `The discount is more than the bill (Rs. ${now.total})`);
  await prisma.tournamentBillLine.create({ data: { tournamentId: id, kind: b.kind, label: b.label, quantity: 1, unitPrice: b.amount, amount: b.kind === "discount" ? -b.amount : b.amount, createdBy: req.staff!.id } });
  await audit(req, b.kind === "discount" ? "discount" : "extra-charge", "tournament", id, { label: b.label, amount: b.amount });
  send(res, await refresh(id), b.kind === "discount" ? "Discount added" : "Charge added", 201);
}));

// removing a line gives goods back to the stock
tournamentEventsRouter.delete("/:id/lines/:lineId", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  await editable(id);
  const line = await prisma.tournamentBillLine.findFirst({ where: { id: param(req, "lineId"), tournamentId: id } });
  if (!line) throw new AppError(404, "That line was not found");
  await prisma.$transaction(async (tx) => {
    if (line.kind === "goods" && line.productId) {
      await tx.product.updateMany({ where: { id: line.productId }, data: { inventory: { increment: line.quantity } } });
      if (await tx.product.findUnique({ where: { id: line.productId }, select: { id: true } })) await tx.inventoryLog.create({ data: { productId: line.productId, change: line.quantity, price: line.unitPrice, reason: `Tournament #${id} (removed from the bill)`, cashAmount: 0, onlineAmount: 0 } });
    }
    await tx.tournamentBillLine.delete({ where: { id: line.id } });
  });
  await audit(req, "remove-line", "tournament", id, { label: line.label, amount: line.amount });
  send(res, await refresh(id), "Removed");
}));

// ---------- receive a payment (cash and/or Fonepay QR) ----------
tournamentEventsRouter.post("/:id/payments", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ amount: z.number().int().min(1).max(10_000_000), payments: paysSchema.optional(), single: z.enum(PAY_METHODS).optional(), fonepayQrId: z.string().optional(), note: z.string().trim().max(200).optional() }), req.body);
  await open(id);
  const now = await bill(id);
  if (b.amount > now.due) throw new AppError(409, now.due <= 0 ? "Nothing is due on this tournament" : `Only Rs. ${now.due} is due`);
  const pays = resolvePays({ payments: b.payments, single: b.single, fonepayQrId: b.fonepayQrId }, b.amount);
  await prisma.$transaction(async (tx) => {
    await claimFonepay(tx, { payments: b.payments, single: b.single, fonepayQrId: b.fonepayQrId }, pays, `tournament:${id}`);
    await tx.tournamentPayment.create({ data: { tournamentId: id, cash: pays.filter((p) => p.method === "cash").reduce((n, p) => n + p.amount, 0), fonepay: pays.filter((p) => p.method === "fonepay").reduce((n, p) => n + p.amount, 0), note: b.note ?? null, receivedBy: req.staff!.id } });
  });
  await audit(req, "receive-payment", "tournament", id, { amount: b.amount, payments: pays, note: b.note });
  send(res, await refresh(id), "Payment received", 201);
}));

// ---------- the final bill ----------
tournamentEventsRouter.post("/:id/final-bill", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  const t = await open(id);
  if (t.billClosedAt) throw new AppError(409, "The final bill was already made");
  await prisma.tournament.update({ where: { id }, data: { billClosedAt: new Date() } });
  const b = await refresh(id);
  await audit(req, "final-bill", "tournament", id, { total: b.total, paid: b.paid, due: b.due });
  send(res, b, "Final bill made");
}));
tournamentEventsRouter.post("/:id/reopen-bill", requirePermission("tournaments.bill"), handler(async (req, res) => {
  const id = param(req, "id");
  await open(id);
  await prisma.tournament.update({ where: { id }, data: { billClosedAt: null } });
  await audit(req, "reopen-bill", "tournament", id);
  send(res, await refresh(id), "The bill is open again");
}));

// ---------- cancel a hosted tournament that has no money or goods on it: the court hours are freed ----------
tournamentEventsRouter.post("/:id/cancel", requirePermission("tournaments.create"), handler(async (req, res) => {
  const id = param(req, "id");
  const t = await open(id);
  const b = await bill(id);
  if (b.payments.length || b.lines.some((l) => l.kind === "goods")) throw new AppError(409, "Money or goods are already on this bill, so it cannot be cancelled. Make the final bill instead.");
  await prisma.$transaction(async (tx) => {
    const ids = (await tx.tournamentDay.findMany({ where: { tournamentId: id } })).flatMap((d) => d.blockIds);
    await tx.bookingSlot.deleteMany({ where: { bookingId: { in: ids.map((x) => `block:${x}`) } } });
    await tx.slotBlock.deleteMany({ where: { id: { in: ids } } });
    await tx.tournament.update({ where: { id }, data: { status: "cancelled", isActive: false } });
  });
  await audit(req, "cancel", "tournament", id, { name: t.name });
  send(res, null, "Tournament cancelled and the court hours are free");
}));
