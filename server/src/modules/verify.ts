// Verify Document (staff side): the verification codes printed on bills and on documents given to schools, banks and colleges.
// The customer site checks a code (customer backend POST /api/verify). Staff can:
//   - see the codes of recent bills and look any code up,
//   - make a code for a DOCUMENT (a reference for another organisation, with notes and photos) and withdraw it later,
//   - get the code of a bill (made on first use) to print on the invoice.
// A code is 4 digits (5 or 6 only when the shorter ones run out) and is never reused.
import express, { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requireAnyPermission, requirePermission } from "../middleware/auth";
import { saveMedia } from "./content";

export const verifyRouter = Router();
// document photos arrive as data URLs, so this router (only reachable after sign-in) accepts bigger bodies than the rest of the API
verifyRouter.use(express.json({ limit: "14mb" }));

export const ORG_TYPES = ["school", "college", "bank", "company", "other"] as const;
const MAX_PHOTOS = 6;

// ---- codes ----
const randomCode = (digits: number) => {
  const min = 10 ** (digits - 1);
  return String(min + Math.floor(Math.random() * 9 * min));
};
type NewDoc = Omit<Prisma.DocVerificationUncheckedCreateInput, "code">;

export async function createWithCode(data: NewDoc) {
  for (const digits of [4, 5, 6]) {
    for (let i = 0; i < (digits === 4 ? 25 : 60); i++) {
      try {
        return await prisma.docVerification.create({ data: { ...data, code: randomCode(digits) } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
        if (target.includes("sourceType") || target.includes("sourceId")) {
          const existing = await prisma.docVerification.findFirst({ where: { sourceType: data.sourceType ?? undefined, sourceId: data.sourceId ?? undefined } });
          if (existing) return existing;
        }
      }
    }
  }
  throw new AppError(500, "No free verification code");
}

export type PaymentSource = "checkout" | "booking" | "gamezone";

/** The code of a paid record, made on first use. Returns null when the record does not exist. */
export async function ensurePaymentCode(sourceType: PaymentSource, sourceId: string, issuedBy?: string): Promise<string | null> {
  const found = await prisma.docVerification.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId } } });
  if (found) return found.code;
  const exists =
    sourceType === "checkout" ? await prisma.checkout.findUnique({ where: { id: sourceId }, select: { id: true } })
    : sourceType === "booking" ? await prisma.booking.findUnique({ where: { id: sourceId }, select: { id: true } })
    : await prisma.gzBooking.findUnique({ where: { code: sourceId }, select: { id: true } });
  if (!exists) return null;
  return (await createWithCode({ kind: "payment", sourceType, sourceId, issuedBy: issuedBy ?? null })).code;
}

const MEDIA = (id: string) => `/api/content/media/${id}`;
const docView = (d: Prisma.DocVerificationGetPayload<object>) => ({
  id: d.id, code: d.code, title: d.title, issuedTo: d.issuedTo, orgType: d.orgType, details: d.details, photos: d.mediaIds.map(MEDIA),
  issuedBy: d.issuedBy, revoked: !!d.revokedAt, createdAt: d.createdAt,
});

// ---- list: documents, and the codes of recent bills ----
verifyRouter.get("/", requirePermission("verify.view"), handler(async (_req, res) => {
  const [docs, payments] = await Promise.all([
    prisma.docVerification.findMany({ where: { kind: "document" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.docVerification.findMany({ where: { kind: "payment" }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const bills = await Promise.all(payments.map(async (p) => {
    let reference = p.sourceId ?? "", customer: string | null = null, total: number | null = null;
    if (p.sourceType === "checkout") {
      const c = await prisma.checkout.findUnique({ where: { id: p.sourceId ?? "" } });
      if (c) { reference = c.code; total = c.total; customer = (await prisma.user.findUnique({ where: { phoneNumber: c.userId }, select: { name: true } }))?.name ?? c.userId; }
    } else if (p.sourceType === "booking") {
      const b = await prisma.booking.findUnique({ where: { id: p.sourceId ?? "" } });
      if (b) { reference = b.code ?? b.id; total = Math.round(b.totalPrice); customer = b.customerName ?? b.userId; }
    } else if (p.sourceType === "gamezone") {
      const g = await prisma.gzBooking.findUnique({ where: { code: p.sourceId ?? "" } });
      if (g) { reference = g.code; total = g.total; customer = g.guestName ?? g.userId; }
    }
    return { id: p.id, code: p.code, sourceType: p.sourceType, reference, customer, total, revoked: !!p.revokedAt, createdAt: p.createdAt };
  }));
  send(res, { documents: docs.map(docView), bills });
}));

// ---- look a code up (what it is, and whether it still verifies) ----
verifyRouter.get("/lookup/:code", requirePermission("verify.view"), handler(async (req, res) => {
  const code = param(req, "code").replace(/\s+/g, "");
  if (!/^\d{4,6}$/.test(code)) throw new AppError(400, "A verification code is 4 digits");
  const d = await prisma.docVerification.findUnique({ where: { code } });
  if (!d) return send(res, { found: false });
  send(res, { found: true, genuine: !d.revokedAt, kind: d.kind, code: d.code, title: d.title, issuedTo: d.issuedTo, sourceType: d.sourceType, issuedAt: d.createdAt, revoked: !!d.revokedAt });
}));

// ---- the code of a bill, for the printed or WhatsApp invoice ----
// whoever hands a bill to a customer: the verify team, the counter (sell), payments and Gamezone collectors
verifyRouter.get("/bill-code", requireAnyPermission(["verify.view", "inventory.sell", "payments.view", "payments.collect", "gamezone.collect"]), handler(async (req, res) => {
  const q = parse(z.object({ type: z.enum(["checkout", "booking", "gamezone"]), id: z.string().min(1).max(60) }), req.query);
  const code = await ensurePaymentCode(q.type, q.id, req.staff!.name);
  if (!code) throw new AppError(404, "That bill was not found");
  send(res, { code });
}));

// ---- documents for other organisations ----
verifyRouter.post("/documents", requirePermission("verify.manage"), handler(async (req, res) => {
  const b = parse(z.object({
    title: z.string().trim().min(3).max(120),
    issuedTo: z.string().trim().min(2).max(120),
    orgType: z.enum(ORG_TYPES).default("other"),
    details: z.string().trim().max(1500).optional(),
    photos: z.array(z.string().min(20)).max(MAX_PHOTOS).default([]),
  }), req.body);
  const mediaIds: string[] = [];
  for (const p of b.photos) mediaIds.push((await saveMedia(p, req.staff!.id)).media.id);
  const doc = await createWithCode({ kind: "document", title: b.title, issuedTo: b.issuedTo, orgType: b.orgType, details: b.details || null, mediaIds, issuedBy: req.staff!.name });
  await audit(req, "create", "doc_verification", doc.id, { code: doc.code, title: b.title, issuedTo: b.issuedTo, photos: mediaIds.length });
  send(res, docView(doc), "Verification code created", 201);
}));

// withdraw a code (it then shows as not genuine on the customer site), or bring it back
verifyRouter.patch("/:id", requirePermission("verify.manage"), handler(async (req, res) => {
  const b = parse(z.object({ revoked: z.boolean() }), req.body);
  const found = await prisma.docVerification.findUnique({ where: { id: param(req, "id") } });
  if (!found) throw new AppError(404, "Code not found");
  const d = await prisma.docVerification.update({ where: { id: found.id }, data: { revokedAt: b.revoked ? new Date() : null } });
  await audit(req, b.revoked ? "revoke" : "restore", "doc_verification", d.id, { code: d.code, kind: d.kind });
  send(res, docView(d), b.revoked ? "Code withdrawn: it no longer verifies" : "Code restored");
}));
