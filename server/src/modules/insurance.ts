// Staff side of insurance claims (the customer app writes them; see the customer backend's /insurance).
// Staff review, approve, reject or close a claim and reply; the filer and the injured player are told in the app.
// The injured player's emergency contact is shown so staff can call the family.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const insuranceRouter = Router();

export const STATUSES = ["submitted", "in_review", "approved", "rejected", "closed"] as const;
const SEVERITIES = ["minor", "emergency"] as const;
const SAYS: Record<string, string> = {
  in_review: "is being reviewed.",
  approved: "is approved.",
  rejected: "was not approved.",
  closed: "is closed.",
  submitted: "is back to received.",
};

type Row = Prisma.InsuranceClaimGetPayload<object>;

async function withPeople(rows: Row[]) {
  const phones = [...new Set(rows.flatMap((r) => [r.userId, r.patientPhone]))];
  const users = await prisma.user.findMany({
    where: { phoneNumber: { in: phones } },
    select: { phoneNumber: true, name: true, emergencyName: true, emergencyPhone: true, emergencyRelation: true },
  });
  const by = new Map(users.map((u) => [u.phoneNumber, u]));
  return rows.map((r) => {
    const patient = by.get(r.patientPhone);
    return {
      id: r.id, code: r.code, patientName: r.patientName, patientPhone: r.patientPhone, witnessName: r.witnessName, witnessNameNe: r.witnessNameNe,
      witnessPhone: r.witnessPhone, severity: r.severity, incidentDate: r.incidentDate, description: r.description, photos: r.photos,
      status: r.status, staffReply: r.staffReply, decidedAt: r.decidedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
      filerPhone: r.userId, filerName: by.get(r.userId)?.name ?? null,
      emergency: patient?.emergencyPhone ? { name: patient.emergencyName, phone: patient.emergencyPhone, relation: patient.emergencyRelation } : null,
    };
  });
}

insuranceRouter.get("/", requirePermission("insurance.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const status = q.status && (STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;
  const severity = q.severity && (SEVERITIES as readonly string[]).includes(q.severity) ? q.severity : undefined;
  const text = q.q?.trim().slice(0, 60);
  const where: Prisma.InsuranceClaimWhereInput = {
    ...(status ? { status } : {}), ...(severity ? { severity } : {}),
    ...(text ? { OR: [
      { code: { contains: text, mode: "insensitive" } }, { patientName: { contains: text, mode: "insensitive" } }, { patientPhone: { contains: text } },
      { userId: { contains: text } }, { witnessName: { contains: text, mode: "insensitive" } }, { witnessNameNe: { contains: text } },
    ] } : {}),
  };
  // emergencies first, then the newest
  const [rows, total] = await Promise.all([
    prisma.insuranceClaim.findMany({ where, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take, skip }),
    prisma.insuranceClaim.count({ where }),
  ]);
  send(res, { items: await withPeople(rows), total, page: pageNo, limit });
}));

// Tab badges
insuranceRouter.get("/counts", requirePermission("insurance.view"), handler(async (_req, res) => {
  const g = await prisma.insuranceClaim.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = { all: 0, submitted: 0, in_review: 0, approved: 0, rejected: 0, closed: 0 };
  for (const r of g) { out[r.status] = r._count._all; out.all += r._count._all; }
  send(res, out);
}));

insuranceRouter.get("/:id", requirePermission("insurance.view"), handler(async (req, res) => {
  const c = await prisma.insuranceClaim.findFirst({ where: { OR: [{ id: param(req, "id") }, { code: param(req, "id") }] } });
  if (!c) throw new AppError(404, "Claim not found");
  const [item] = await withPeople([c]);
  send(res, { ...item, patientClaims: await prisma.insuranceClaim.count({ where: { patientPhone: c.patientPhone } }) });
}));

insuranceRouter.patch("/:id", requirePermission("insurance.reply"), handler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(STATUSES).optional(), reply: z.string().trim().max(1000, "Keep the reply under 1000 characters").optional() }), req.body);
  if (b.status === undefined && !b.reply) throw new AppError(400, "Choose a status or write a reply");
  const c = await prisma.insuranceClaim.findUnique({ where: { id: param(req, "id") } });
  if (!c) throw new AppError(404, "Claim not found");
  const status = b.status ?? c.status;
  const decided = status === "approved" || status === "rejected" || status === "closed";
  const upd = await prisma.insuranceClaim.update({
    where: { id: c.id },
    data: { status, ...(b.reply ? { staffReply: b.reply, repliedBy: req.staff!.id } : {}), decidedAt: decided ? c.decidedAt ?? new Date() : null },
  });
  const changed = status !== c.status || (!!b.reply && b.reply !== c.staffReply);
  if (changed) {
    const text = b.reply ? `The venue replied: ${b.reply.slice(0, 120)}${b.reply.length > 120 ? "…" : ""}` : `Your insurance claim ${SAYS[status] ?? `is now ${status}.`}`;
    for (const userId of new Set([c.userId, c.patientPhone])) {
      await notify(prisma, { userId, type: "insurance", title: `Update on insurance claim ${c.code}`, message: text, href: "/insurance" });
    }
  }
  await audit(req, "update", "insurance", c.id, { code: c.code, status, replied: !!b.reply });
  const [item] = await withPeople([upd]);
  send(res, item, changed ? "Saved. The customer has been notified." : "Saved");
}));
