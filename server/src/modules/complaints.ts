// Staff side of customer complaints (the customer app writes them; see the customer backend's /complaints).
// Rules mirror the customer backend's staff update: status or reply (up to 1000 characters); the customer is told in the app.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const complaintsRouter = Router();

export const CATEGORIES: Record<string, string> = {
  booking: "Booking", payment: "Payment or refund", facilities: "Court or facilities", staff: "Staff behaviour",
  gamezone: "Gamezone", membership: "Membership", app: "App problem", other: "Other",
};
const STATUSES = ["open", "in_review", "resolved", "closed"] as const;

type Row = Prisma.ComplaintGetPayload<object>;

async function withCustomers(rows: Row[]) {
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  return rows.map((r) => ({
    id: r.id, code: r.code, category: r.category, categoryLabel: CATEGORIES[r.category] ?? r.category, message: r.message, bookingCode: r.bookingCode,
    photos: r.photos, status: r.status, staffReply: r.staffReply, createdAt: r.createdAt, updatedAt: r.updatedAt, resolvedAt: r.resolvedAt,
    customerPhone: r.userId, customerName: name.get(r.userId) ?? null,
  }));
}

complaintsRouter.get("/", requirePermission("complaints.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const status = q.status && (STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;
  const category = q.category && CATEGORIES[q.category] ? q.category : undefined;
  const text = q.q?.trim().slice(0, 60);
  const byName = text ? await prisma.user.findMany({ where: { name: { contains: text, mode: "insensitive" } }, select: { phoneNumber: true }, take: 50 }) : [];
  const where: Prisma.ComplaintWhereInput = {
    ...(status ? { status } : {}), ...(category ? { category } : {}),
    ...(text ? { OR: [{ code: { contains: text, mode: "insensitive" } }, { message: { contains: text, mode: "insensitive" } }, { userId: { contains: text } }, { userId: { in: byName.map((u) => u.phoneNumber) } }] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }), prisma.complaint.count({ where })]);
  send(res, { items: await withCustomers(rows), total, page: pageNo, limit });
}));

// Tab badges
complaintsRouter.get("/counts", requirePermission("complaints.view"), handler(async (_req, res) => {
  const g = await prisma.complaint.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = { all: 0, open: 0, in_review: 0, resolved: 0, closed: 0 };
  for (const r of g) { out[r.status] = r._count._all; out.all += r._count._all; }
  send(res, out);
}));

complaintsRouter.get("/:id", requirePermission("complaints.view"), handler(async (req, res) => {
  const c = await prisma.complaint.findFirst({ where: { OR: [{ id: param(req, "id") }, { code: param(req, "id") }] } });
  if (!c) throw new AppError(404, "Complaint not found");
  const [item] = await withCustomers([c]);
  const history = await prisma.complaint.count({ where: { userId: c.userId } });
  send(res, { ...item, customerComplaints: history });
}));

complaintsRouter.patch("/:id", requirePermission("complaints.reply"), handler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(STATUSES).optional(), reply: z.string().trim().max(1000, "Keep the reply under 1000 characters").optional() }), req.body);
  if (b.status === undefined && !b.reply) throw new AppError(400, "Choose a status or write a reply");
  const c = await prisma.complaint.findUnique({ where: { id: param(req, "id") } });
  if (!c) throw new AppError(404, "Complaint not found");
  const status = b.status ?? c.status;
  const done = status === "resolved" || status === "closed";
  const upd = await prisma.complaint.update({
    where: { id: c.id },
    data: { status, ...(b.reply ? { staffReply: b.reply, repliedBy: req.staff!.id } : {}), resolvedAt: done ? c.resolvedAt ?? new Date() : null },
  });
  const changed = status !== c.status || (!!b.reply && b.reply !== c.staffReply);
  if (changed) {
    const text = b.reply ? `The venue replied: ${b.reply.slice(0, 120)}${b.reply.length > 120 ? "…" : ""}` : `Status: ${status.replace("_", " ")}.`;
    await notify(prisma, { userId: c.userId, type: "complaint", title: `Update on your complaint ${c.code}`, message: text, href: "/complaints" });
  }
  await audit(req, "update", "complaint", c.id, { code: c.code, status, replied: !!b.reply });
  const [item] = await withCustomers([upd]);
  send(res, item, changed ? "Saved. The customer has been notified." : "Saved");
}));
