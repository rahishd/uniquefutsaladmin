// Fonepay dynamic QR for money collected at the counter (a bill with a Fonepay part, for example Rs. 500 cash + Rs. 500 Fonepay).
// Endpoints are the same for the test provider and the real one (lib/fonepay.ts decides which is used).
import { Prisma } from "@prisma/client";
import { Request, Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { getFonepay, makePrn, qrImage } from "../lib/fonepay";
import { AppError, handler, param, parse, send } from "../lib/http";

// Needs a staff sign-in and one of the permissions that collect money
const CAN_COLLECT = ["payments.collect", "inventory.sell", "bookings.create"];
function mustCollect(req: Request) {
  if (!req.staff || !CAN_COLLECT.some((p) => (req.staff!.permissions as string[]).includes(p))) throw new AppError(403, "You do not have permission to collect payments");
}

export const fonepayRouter = Router();

type Row = Prisma.FonepayQrGetPayload<object>;
async function view(q: Row, withImage = false) {
  return {
    id: q.id, prn: q.prn, amount: q.amount, remarks: q.remarks, status: q.status, expiresAt: q.expiresAt, paidAt: q.paidAt, reference: q.paidReference, used: !!q.consumedAt,
    mode: getFonepay().mode, ...(withImage ? { qrPayload: q.payload, qrImage: await qrImage(q.payload) } : {}),
  };
}

// A pending QR that ran out of time becomes expired
async function refresh(q: Row): Promise<Row> {
  if (q.status !== "pending") return q;
  if (q.expiresAt.getTime() <= Date.now()) return prisma.fonepayQr.update({ where: { id: q.id }, data: { status: "expired" } });
  // ask the gateway (the test provider just echoes what we know; the live one calls Fonepay)
  const s = await getFonepay().checkStatus(q.prn, { state: "pending" });
  if (s.state === "paid") return markPaid(q.id, s.paidAmount ?? q.amount, s.reference ?? null);
  if (s.state === "failed" || s.state === "expired") return prisma.fonepayQr.update({ where: { id: q.id }, data: { status: s.state } });
  return q;
}

// Idempotent: a repeated callback changes nothing. The amount must match what the QR was made for.
async function markPaid(id: string, paidAmount: number, reference: string | null): Promise<Row> {
  const q = await prisma.fonepayQr.findUnique({ where: { id } });
  if (!q) throw new AppError(404, "QR not found");
  if (q.status === "paid") return q;
  if (paidAmount !== q.amount) {
    await prisma.fonepayQr.update({ where: { id }, data: { status: "failed", note: `Amount mismatch: expected ${q.amount}, got ${paidAmount}` } });
    throw new AppError(409, "The paid amount does not match the QR");
  }
  await prisma.fonepayQr.updateMany({ where: { id, status: { in: ["pending", "expired"] } }, data: { status: "paid", paidAt: new Date(), paidReference: reference } });
  return (await prisma.fonepayQr.findUnique({ where: { id } }))!;
}

// Make a QR for an exact amount. The amount is final: to change it, make a new QR.
fonepayRouter.post("/qr", handler(async (req, res) => {
  mustCollect(req);
  const b = parse(z.object({
    amount: z.number().int().min(1, "The amount must be at least Rs. 1").max(1_000_000, "Too large for one QR"),
    remarks: z.string().trim().max(60).optional(), purpose: z.string().trim().max(40).default("counter"), customerPhone: z.string().regex(/^9\d{9}$/).optional(),
  }), req.body);
  const prn = makePrn();
  const expiresAt = new Date(Date.now() + env.FONEPAY_QR_TTL_MINUTES * 60_000);
  const remarks = b.remarks || `Unique Futsal ${prn}`;
  const r = await getFonepay().createQr({ prn, amount: b.amount, remarks, expiresAt });
  const q = await prisma.fonepayQr.create({ data: { prn, amount: b.amount, remarks, payload: r.payload, providerRef: r.providerRef, purpose: b.purpose, customerPhone: b.customerPhone ?? null, createdBy: req.staff!.id, expiresAt } });
  await audit(req, "create", "fonepay_qr", q.id, { prn, amount: b.amount, purpose: b.purpose, mode: getFonepay().mode });
  send(res, await view(q, true), "Fonepay QR ready", 201);
}));

// The screen polls this every few seconds until the QR is paid
fonepayRouter.get("/qr/:id", handler(async (req, res) => {
  mustCollect(req);
  const q = await prisma.fonepayQr.findUnique({ where: { id: param(req, "id") } });
  if (!q) throw new AppError(404, "QR not found");
  send(res, await view(await refresh(q)));
}));

fonepayRouter.post("/qr/:id/cancel", handler(async (req, res) => {
  mustCollect(req);
  const q = await prisma.fonepayQr.findUnique({ where: { id: param(req, "id") } });
  if (!q) throw new AppError(404, "QR not found");
  if (q.status === "paid") throw new AppError(409, "This QR is already paid and cannot be cancelled");
  const upd = await prisma.fonepayQr.update({ where: { id: q.id }, data: { status: "failed", note: "Cancelled by staff" } });
  await audit(req, "cancel", "fonepay_qr", q.id, { prn: q.prn });
  send(res, await view(upd), "QR cancelled");
}));

// TEST ONLY: plays the part of the gateway ("the customer paid"). Not available in live mode.
fonepayRouter.post("/qr/:id/simulate-paid", handler(async (req, res) => {
  mustCollect(req);
  if (getFonepay().mode !== "test") throw new AppError(404, "Not found");
  const q = await prisma.fonepayQr.findUnique({ where: { id: param(req, "id") } });
  if (!q) throw new AppError(404, "QR not found");
  if (q.status === "expired" || q.expiresAt.getTime() <= Date.now()) throw new AppError(409, "This QR has expired. Make a new one.");
  if (q.status === "failed") throw new AppError(409, "This QR was cancelled. Make a new one.");
  const paid = await markPaid(q.id, q.amount, `TEST-${q.prn}`);
  await audit(req, "simulate-paid", "fonepay_qr", q.id, { prn: q.prn, amount: q.amount });
  send(res, await view(paid), "Test payment recorded");
}));

// The gateway's callback. PUBLIC (no staff sign-in): it is trusted only after the provider checks the gateway's signature.
export const fonepayWebhookRouter = Router();
fonepayWebhookRouter.post("/", handler(async (req, res) => {
  const v = getFonepay().verifyCallback(req.headers as Record<string, unknown>, req.body); // throws 501 in test mode, 400/401 if not genuine
  const q = await prisma.fonepayQr.findUnique({ where: { prn: v.prn } });
  if (!q) throw new AppError(404, "Unknown payment reference");
  await markPaid(q.id, v.paidAmount, v.reference);
  send(res, null, "OK");
}));
