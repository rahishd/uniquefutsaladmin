// Staff side of wheelchair requests (the customer app writes them; see the customer backend's /wheelchair).
// Staff confirm, decline, complete or reply; the customer is told in the app.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const wheelchairRouter = Router();

export const STATUSES = ["pending", "confirmed", "completed", "declined", "cancelled"] as const;
const SAYS: Record<string, string> = {
  confirmed: "is confirmed. We will be ready for you.",
  declined: "could not be arranged.",
  completed: "is marked as done.",
  pending: "is back to waiting.",
};

type Row = Prisma.WheelchairRequestGetPayload<object>;

async function withCustomers(rows: Row[]) {
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { phoneNumber: true, name: true } });
  const name = new Map(users.map((u) => [u.phoneNumber, u.name]));
  return rows.map((r) => ({
    id: r.id, code: r.code, date: r.date, time: r.time, people: r.people, note: r.note, bookingCode: r.bookingCode,
    status: r.status, staffReply: r.staffReply, createdAt: r.createdAt, updatedAt: r.updatedAt,
    customerPhone: r.userId, customerName: name.get(r.userId) ?? null,
  }));
}

wheelchairRouter.get("/", requirePermission("wheelchair.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const status = q.status && (STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;
  const text = q.q?.trim().slice(0, 60);
  const byName = text ? await prisma.user.findMany({ where: { name: { contains: text, mode: "insensitive" } }, select: { phoneNumber: true }, take: 50 }) : [];
  const where: Prisma.WheelchairRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(text ? { OR: [{ code: { contains: text, mode: "insensitive" } }, { note: { contains: text, mode: "insensitive" } }, { userId: { contains: text } }, { userId: { in: byName.map((u) => u.phoneNumber) } }] } : {}),
  };
  // visits that are coming up first, then the rest by when they were asked
  const [rows, total] = await Promise.all([
    prisma.wheelchairRequest.findMany({ where, orderBy: [{ date: "asc" }, { time: "asc" }], take, skip }),
    prisma.wheelchairRequest.count({ where }),
  ]);
  send(res, { items: await withCustomers(rows), total, page: pageNo, limit });
}));

// Tab badges
wheelchairRouter.get("/counts", requirePermission("wheelchair.view"), handler(async (_req, res) => {
  const g = await prisma.wheelchairRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = { all: 0, pending: 0, confirmed: 0, completed: 0, declined: 0, cancelled: 0 };
  for (const r of g) { out[r.status] = r._count._all; out.all += r._count._all; }
  send(res, out);
}));

wheelchairRouter.get("/:id", requirePermission("wheelchair.view"), handler(async (req, res) => {
  const r = await prisma.wheelchairRequest.findFirst({ where: { OR: [{ id: param(req, "id") }, { code: param(req, "id") }] } });
  if (!r) throw new AppError(404, "Request not found");
  const [item] = await withCustomers([r]);
  send(res, { ...item, customerRequests: await prisma.wheelchairRequest.count({ where: { userId: r.userId } }) });
}));

wheelchairRouter.patch("/:id", requirePermission("wheelchair.reply"), handler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(STATUSES).optional(), reply: z.string().trim().max(1000, "Keep the reply under 1000 characters").optional() }), req.body);
  if (b.status === undefined && !b.reply) throw new AppError(400, "Choose a status or write a reply");
  const r = await prisma.wheelchairRequest.findUnique({ where: { id: param(req, "id") } });
  if (!r) throw new AppError(404, "Request not found");
  if (r.status === "cancelled") throw new AppError(409, "The customer cancelled this request.");
  const status = b.status ?? r.status;
  const upd = await prisma.wheelchairRequest.update({ where: { id: r.id }, data: { status, ...(b.reply ? { staffReply: b.reply, repliedBy: req.staff!.id } : {}) } });
  const changed = status !== r.status || (!!b.reply && b.reply !== r.staffReply);
  if (changed) {
    const text = b.reply
      ? `The venue replied: ${b.reply.slice(0, 120)}${b.reply.length > 120 ? "…" : ""}`
      : `Your wheelchair request for ${r.date} ${SAYS[status] ?? `is now ${status}.`}`;
    await notify(prisma, { userId: r.userId, type: "wheelchair", title: `Update on your wheelchair request ${r.code}`, message: text, href: "/wheelchair" });
  }
  await audit(req, "update", "wheelchair", r.id, { code: r.code, status, replied: !!b.reply });
  const [item] = await withCustomers([upd]);
  send(res, item, changed ? "Saved. The customer has been notified." : "Saved");
}));
