import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { controllerFor, parseConfig } from "../lib/ev-controller";
import { claimFonepay, paysSchema, resolvePays } from "../lib/settle";
import { requirePermission } from "../middleware/auth";
import { getSetting } from "./settings-store";

// Paid AC EV charging at the venue: Rs. 50 per hour unless the Settings key "evChargeRate" says otherwise, billed by started quarter hours.
// A customer scans the QR at a charging port in the app to start and stop (customer backend, /api/ev). Staff can also start a session for
// a walk-in, stop one, record a charge that is paid straight away, and mark an unpaid session paid. Only paid sessions count as revenue.
export const evChargingRouter = Router();
export const DEFAULT_RATE = 50;
const BLOCK_MINUTES = 15;
const MAX_HOURS = 24;

const rateNow = async () => Math.max(1, Math.round(Number((await getSetting("evChargeRate")) ?? DEFAULT_RATE)) || DEFAULT_RATE);
const minutesBetween = (start: Date, end: Date) => Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 60000));
const amountFor = (minutes: number, rate: number) => Math.ceil(Math.ceil(minutes / BLOCK_MINUTES) * rate / (60 / BLOCK_MINUTES));

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const makeToken = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// Nepal day boundaries (UTC+5:45) as instants
const NEPAL_MS = (5 * 60 + 45) * 60 * 1000;
const startOfDay = (offsetDays = 0) => {
  const local = new Date(Date.now() + NEPAL_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - NEPAL_MS + offsetDays * 86_400_000);
};

// revenue = paid sessions only
const sum = async (from?: Date) => {
  const r = await prisma.evCharge.aggregate({ where: { status: "paid", ...(from ? { createdAt: { gte: from } } : {}) }, _sum: { amount: true, hours: true, cashAmount: true, onlineAmount: true }, _count: true });
  return { count: r._count, hours: r._sum.hours ?? 0, amount: r._sum.amount ?? 0, cash: r._sum.cashAmount ?? 0, online: r._sum.onlineAmount ?? 0 };
};

type Row = Awaited<ReturnType<typeof prisma.evCharge.findMany>>[number];
async function present(rows: Row[]) {
  const ports = await prisma.evPort.findMany({ select: { id: true, name: true } });
  const pn = new Map(ports.map((p) => [p.id, p.name]));
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { phoneNumber: true, name: true } });
  const un = new Map(users.map((u) => [u.phoneNumber, u.name]));
  return rows.map((r) => ({ ...r, port: r.portId ? pn.get(r.portId) ?? null : null, customerName: r.customerName ?? (r.userId ? un.get(r.userId) ?? null : null) }));
}

evChargingRouter.get("/", requirePermission("payments.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const search = q.q?.trim();
  const where: Prisma.EvChargeWhereInput = {
    ...(q.status && ["charging", "unpaid", "paid", "cancelled"].includes(q.status) ? { status: q.status } : {}),
    ...(search ? { OR: [{ customerName: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { vehicle: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, today, month, all, charging, unpaid] = await Promise.all([
    prisma.evCharge.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.evCharge.count({ where }),
    sum(startOfDay()),
    sum(new Date(startOfDay().getTime() - 29 * 86_400_000)),
    sum(),
    prisma.evCharge.findMany({ where: { status: "charging" }, orderBy: { startedAt: "asc" } }),
    prisma.evCharge.aggregate({ where: { status: "unpaid" }, _sum: { amount: true }, _count: true }),
  ]);
  send(res, {
    rate: await rateNow(), items: await present(rows), total, page: pageNo, limit, summary: { today, last30: month, all }, active: await present(charging),
    unpaid: { count: unpaid._count, amount: unpaid._sum.amount ?? 0 },
  });
}));

// ---------- ports (each has a QR token printed at the station) ----------
// The QR only names the port; what switches the plug is the port's controller (manual, or a webhook to a smart plug bridge such as Tuya),
// so connecting a plug system later never changes the printed QR. The secret is never sent back to the browser.
const portView = (p: { id: string; name: string; note: string | null; qrToken: string; isActive: boolean; createdAt: Date; provider: string; providerConfig: string | null }) => {
  const c = parseConfig(p);
  return { id: p.id, name: p.name, note: p.note, qrToken: p.qrToken, isActive: p.isActive, createdAt: p.createdAt, provider: p.provider, webhookUrl: c.url ?? "", deviceId: c.deviceId ?? "", hasSecret: !!c.secret };
};
const controllerFields = {
  provider: z.enum(["manual", "webhook"]).optional(),
  webhookUrl: z.string().trim().max(300).refine((u) => u === "" || /^https?:\/\//i.test(u), "The webhook address must start with http:// or https://").optional(),
  webhookSecret: z.string().max(120).optional(), // empty keeps the old one
  deviceId: z.string().trim().max(120).optional(),
};
const configFrom = (old: string | null, b: { webhookUrl?: string; webhookSecret?: string; deviceId?: string }) => {
  const c = parseConfig({ providerConfig: old });
  if (b.webhookUrl !== undefined) c.url = b.webhookUrl || undefined;
  if (b.deviceId !== undefined) c.deviceId = b.deviceId || undefined;
  if (b.webhookSecret) c.secret = b.webhookSecret;
  return JSON.stringify(c);
};
evChargingRouter.get("/ports", requirePermission("payments.view"), handler(async (_req, res) => {
  const [ports, charging] = await Promise.all([prisma.evPort.findMany({ orderBy: { createdAt: "asc" } }), prisma.evCharge.findMany({ where: { status: "charging", portId: { not: null } } })]);
  const busy = new Map(charging.map((c) => [c.portId!, c]));
  send(res, ports.map((p) => ({ ...portView(p), busy: !!busy.get(p.id), startedAt: busy.get(p.id)?.startedAt ?? null, customerName: busy.get(p.id)?.customerName ?? null })));
}));

evChargingRouter.post("/ports", requirePermission("payments.collect"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(40), note: z.string().trim().max(120).optional(), ...controllerFields }), req.body);
  if (b.provider === "webhook" && !b.webhookUrl) throw new AppError(400, "Enter the webhook address for this port.");
  const row = await prisma.evPort.create({ data: { name: b.name, note: b.note || null, qrToken: makeToken(), provider: b.provider ?? "manual", providerConfig: configFrom(null, b) } });
  await audit(req, "create", "ev_port", row.id, { name: row.name, provider: row.provider });
  send(res, portView(row), "Charging port added", 201);
}));

evChargingRouter.patch("/ports/:id", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ name: z.string().trim().min(2).max(40).optional(), note: z.string().trim().max(120).optional(), isActive: z.boolean().optional(), newQr: z.boolean().optional(), ...controllerFields }), req.body);
  const old = await prisma.evPort.findUnique({ where: { id } });
  if (!old) throw new AppError(404, "Port not found");
  const provider = b.provider ?? old.provider;
  const touched = b.provider !== undefined || b.webhookUrl !== undefined || b.webhookSecret !== undefined || b.deviceId !== undefined;
  const providerConfig = touched ? configFrom(old.providerConfig, b) : old.providerConfig;
  if (provider === "webhook" && !parseConfig({ providerConfig }).url) throw new AppError(400, "Enter the webhook address for this port.");
  const row = await prisma.evPort.update({ where: { id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.note !== undefined ? { note: b.note || null } : {}), ...(b.isActive !== undefined ? { isActive: b.isActive } : {}), ...(b.newQr ? { qrToken: makeToken() } : {}), provider, providerConfig } });
  await audit(req, "update", "ev_port", id, { ...b, webhookSecret: b.webhookSecret ? "(changed)" : undefined });
  send(res, portView(row), "Saved");
}));

// Send a test "on" or "off" to the port's controller, to check the plug before customers use it.
evChargingRouter.post("/ports/:id/test", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ action: z.enum(["on", "off"]) }), req.body);
  const port = await prisma.evPort.findUnique({ where: { id } });
  if (!port) throw new AppError(404, "Port not found");
  try {
    await controllerFor(port).switch(port, b.action, { sessionId: "test", customerName: "Test" });
  } catch (e) {
    throw new AppError(502, e instanceof Error ? e.message : "The charger did not answer.");
  }
  await audit(req, "ev-port-test", "ev_port", id, { action: b.action });
  send(res, { ok: true }, port.provider === "manual" ? "Manual port: nothing to switch, the test passed." : `Switch ${b.action} sent.`);
}));

evChargingRouter.delete("/ports/:id", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  if (await prisma.evCharge.count({ where: { portId: id } })) throw new AppError(409, "This port has charging history. Switch it off instead of deleting it.");
  await prisma.evPort.delete({ where: { id } });
  await audit(req, "delete", "ev_port", id, {});
  send(res, { removed: true }, "Port removed");
}));

// ---------- sessions ----------
// Switch the plug off when a session is stopped or cancelled here. Returns a warning text if the plug did not answer (the bill is still made).
async function switchOff(row: { id: string; portId: string | null; customerName: string | null }): Promise<string | null> {
  if (!row.portId) return null;
  const port = await prisma.evPort.findUnique({ where: { id: row.portId } });
  if (!port) return null;
  try {
    await controllerFor(port).switch(port, "off", { sessionId: row.id, customerName: row.customerName });
    return null;
  } catch {
    return "Stopped, but the charger did not switch off. Switch it off by hand.";
  }
}
// A charge for someone who is not using the app: paid straight away (hours at the hourly rate).
evChargingRouter.post("/", requirePermission("payments.collect"), handler(async (req, res) => {
  const b = parse(z.object({
    customerName: z.string().trim().max(80).optional(), phone: z.string().regex(/^9\d{9}$/, "Enter a 10-digit mobile number starting with 9").optional(), vehicle: z.string().trim().max(40).optional(),
    portId: z.string().min(1).optional(), hours: z.number().int().min(1).max(MAX_HOURS), payment: z.enum(["cash", "online"]).optional(), payments: paysSchema.optional(), fonepayQrId: z.string().min(1).optional(),
  }), req.body);
  const rate = await rateNow();
  const amount = rate * b.hours;
  const input = { payments: b.payments, fonepayQrId: b.fonepayQrId, single: b.payment === "online" ? ("fonepay" as const) : b.payment === "cash" ? ("cash" as const) : undefined };
  const pays = resolvePays(input, amount);
  const row = await prisma.$transaction(async (tx) => {
    await claimFonepay(tx, input, pays, "ev charging");
    const cash = pays.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    return tx.evCharge.create({
      data: {
        customerName: b.customerName || null, phone: b.phone ?? null, vehicle: b.vehicle || null, portId: b.portId ?? null, hours: b.hours, minutes: b.hours * 60, rate, amount, cashAmount: cash, onlineAmount: amount - cash,
        status: "paid", source: "staff", paidAt: new Date(), createdBy: req.staff!.id,
      },
    });
  });
  await audit(req, "ev-charge", "ev_charge", row.id, { hours: b.hours, amount, customer: b.customerName ?? b.phone ?? "walk-in", payments: pays });
  send(res, row, `EV charging recorded: Rs. ${amount}`, 201);
}));

// Staff stop a session that is still charging (the customer forgot to). It becomes an unpaid bill.
evChargingRouter.post("/:id/stop", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  const row = await prisma.evCharge.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Session not found");
  if (row.status !== "charging") throw new AppError(409, "This session is not charging");
  const end = new Date();
  const minutes = minutesBetween(row.startedAt ?? row.createdAt, end);
  const done = await prisma.evCharge.updateMany({ where: { id, status: "charging" }, data: { status: "unpaid", endedAt: end, minutes, hours: Math.ceil(minutes / 60), amount: amountFor(minutes, row.rate) } });
  if (done.count !== 1) throw new AppError(409, "This session is not charging");
  await audit(req, "ev-stop", "ev_charge", id, { minutes });
  const warning = await switchOff(row);
  send(res, await prisma.evCharge.findUnique({ where: { id } }), warning ?? "Charging stopped");
}));

// Collect an unpaid session: cash, Fonepay QR, or both.
evChargingRouter.post("/:id/pay", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ payment: z.enum(["cash", "online"]).optional(), payments: paysSchema.optional(), fonepayQrId: z.string().min(1).optional() }), req.body);
  const row = await prisma.evCharge.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Session not found");
  if (row.status !== "unpaid") throw new AppError(409, row.status === "paid" ? "This session is already paid" : "Stop the charging session first");
  const input = { payments: b.payments, fonepayQrId: b.fonepayQrId, single: b.payment === "online" ? ("fonepay" as const) : b.payment === "cash" ? ("cash" as const) : undefined };
  const pays = resolvePays(input, row.amount);
  await prisma.$transaction(async (tx) => {
    await claimFonepay(tx, input, pays, "ev charging");
    const cash = pays.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    const claimed = await tx.evCharge.updateMany({ where: { id, status: "unpaid" }, data: { status: "paid", paidAt: new Date(), cashAmount: cash, onlineAmount: row.amount - cash } });
    if (claimed.count !== 1) throw new AppError(409, "This session is already paid");
  });
  await audit(req, "ev-pay", "ev_charge", id, { amount: row.amount, payments: pays });
  send(res, await prisma.evCharge.findUnique({ where: { id } }), `Collected Rs. ${row.amount}`);
}));

// Cancel a session that should not be billed (a mistake, or a test).
evChargingRouter.post("/:id/cancel", requirePermission("payments.collect"), handler(async (req, res) => {
  const id = param(req, "id");
  const done = await prisma.evCharge.updateMany({ where: { id, status: { in: ["charging", "unpaid"] } }, data: { status: "cancelled", endedAt: new Date() } });
  if (done.count !== 1) throw new AppError(409, "Only a charging or unpaid session can be cancelled");
  await audit(req, "ev-cancel", "ev_charge", id, {});
  const row = await prisma.evCharge.findUnique({ where: { id } });
  const warning = row ? await switchOff(row) : null;
  send(res, { cancelled: true }, warning ?? "Session cancelled");
}));
