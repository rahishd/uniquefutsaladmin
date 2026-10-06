import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const gamezoneRouter = Router();

gamezoneRouter.get("/bookings", requirePermission("gamezone.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const where: Prisma.GzBookingWhereInput = {
    ...(q.date ? { date: q.date } : {}), ...(q.status ? { status: q.status } : {}), ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.q ? { OR: [{ code: { contains: q.q, mode: "insensitive" } }, { guestName: { contains: q.q, mode: "insensitive" } }, { guestPhone: { contains: q.q } }, { userId: { contains: q.q } }] } : {}),
  };
  const [items, total] = await Promise.all([prisma.gzBooking.findMany({ where, orderBy: [{ date: "desc" }, { startHour: "desc" }], take, skip }), prisma.gzBooking.count({ where })]);
  send(res, { items, total, page: pageNo, limit });
}));

const load = async (code: string) => {
  const b = await prisma.gzBooking.findUnique({ where: { code } });
  if (!b) throw new AppError(404, "Gamezone booking not found");
  return b;
};

gamezoneRouter.post("/bookings/:code/mark-paid", requirePermission("gamezone.collect"), handler(async (req, res) => {
  const b = await load(param(req, "code"));
  if (b.status === "cancelled" || b.status === "expired") throw new AppError(409, `This booking is ${b.status}`);
  if (b.paymentStatus === "paid") throw new AppError(409, "Already paid");
  await prisma.$transaction([
    prisma.gzBooking.update({ where: { code: b.code }, data: { paymentStatus: "paid", holdExpiresAt: null } }),
    prisma.paymentOrder.updateMany({ where: { orderCode: b.code, status: { in: ["pending", "expired"] } }, data: { status: "paid", paidAt: new Date(), paidBy: req.staff!.id } }),
  ]);
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Payment received", message: `Rs. ${b.total} for your Gamezone session ${b.code} was received.`, href: "/gamezone", dedupeKey: `gz-paid-${b.code}` });
  await audit(req, "mark-paid", "gamezone", b.code, { total: b.total });
  send(res, null, "Marked as paid");
}));

gamezoneRouter.post("/bookings/:code/complete", requirePermission("gamezone.manage"), handler(async (req, res) => {
  const b = await load(param(req, "code"));
  if (b.status !== "confirmed") throw new AppError(409, `Only confirmed sessions can be completed (this one is ${b.status})`);
  await prisma.gzBooking.update({ where: { code: b.code }, data: { status: "completed" } });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Thanks for playing", message: `Your Gamezone session ${b.code} is complete. See you again soon!`, href: "/gamezone", dedupeKey: `gz-done-${b.code}` });
  await audit(req, "complete", "gamezone", b.code);
  send(res, null, "Session completed");
}));

gamezoneRouter.post("/bookings/:code/cancel", requirePermission("gamezone.manage"), handler(async (req, res) => {
  const b = await load(param(req, "code"));
  if (b.status === "cancelled" || b.status === "completed") throw new AppError(409, `This booking is ${b.status}`);
  await prisma.$transaction(async (tx) => {
    await tx.gzBooking.update({ where: { code: b.code }, data: { status: "cancelled", paymentStatus: b.paymentStatus === "paid" ? "refunded" : b.paymentStatus, holdExpiresAt: null } });
    await tx.gzSlot.deleteMany({ where: { bookingCode: b.code } });
    const order = await tx.paymentOrder.findUnique({ where: { orderCode: b.code } });
    if (order?.status === "paid") {
      await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "refunded" } });
      await tx.paymentEvent.create({ data: { orderCode: b.code, source: "staff", payload: JSON.stringify({ event: "REFUND_DUE", reason: "CANCELLED_BY_STAFF", amount: order.amount, method: order.method }) } });
    }
  });
  if (b.userId) await notify(prisma, { userId: b.userId, type: "gamezone", title: "Gamezone session cancelled", message: `Your Gamezone session ${b.code} was cancelled by the venue.${b.paymentStatus === "paid" ? " Your payment will be refunded." : ""}`, href: "/gamezone", dedupeKey: `gz-cancel-${b.code}` });
  await audit(req, "cancel", "gamezone", b.code);
  send(res, null, "Session cancelled");
}));

// ---- catalog: consoles, games, plans (rates) ----
gamezoneRouter.get("/catalog", requirePermission("gamezone.view"), handler(async (_req, res) => {
  const [consoles, games, plans] = await Promise.all([prisma.gzConsole.findMany({ orderBy: { name: "asc" } }), prisma.gzGame.findMany({ orderBy: { title: "asc" } }), prisma.gzPlan.findMany({ orderBy: { players: "asc" } })]);
  send(res, { consoles, games, plans });
}));

const name = z.string().trim().min(2).max(40);
const dup = (e: unknown) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That name already exists"); throw e; };

gamezoneRouter.post("/consoles", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ name }), req.body);
  const row = await prisma.gzConsole.create({ data: { name: b.name } }).catch(dup);
  await audit(req, "create", "gz-console", row.id, b);
  send(res, row, "Console added", 201);
}));
gamezoneRouter.patch("/consoles/:id", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ name: name.optional(), active: z.boolean().optional() }), req.body);
  const id = param(req, "id");
  const row = await prisma.gzConsole.update({ where: { id }, data: b }).catch((e) => { if (e?.code === "P2025") throw new AppError(404, "Console not found"); return dup(e); });
  await audit(req, "update", "gz-console", id, b);
  send(res, row, "Console saved");
}));

gamezoneRouter.post("/games", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ title: name }), req.body);
  const row = await prisma.gzGame.create({ data: { title: b.title } }).catch(dup);
  await audit(req, "create", "gz-game", row.id, b);
  send(res, row, "Game added", 201);
}));
gamezoneRouter.patch("/games/:id", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const b = parse(z.object({ title: name.optional(), active: z.boolean().optional() }), req.body);
  const id = param(req, "id");
  const row = await prisma.gzGame.update({ where: { id }, data: b }).catch((e) => { if (e?.code === "P2025") throw new AppError(404, "Game not found"); return dup(e); });
  await audit(req, "update", "gz-game", id, b);
  send(res, row, "Game saved");
}));

// Rate per person per hour for 1, 2 or 4 players. Customers pay rate x players x hours, computed on the server.
gamezoneRouter.put("/plans/:players", requirePermission("gamezone.catalog"), handler(async (req, res) => {
  const players = parse(z.coerce.number().int().refine((n) => [1, 2, 4].includes(n), "1, 2 or 4"), param(req, "players"));
  const b = parse(z.object({ label: z.string().min(2).max(30), ratePerPersonHour: z.number().int().min(0).max(100000) }), req.body);
  const row = await prisma.gzPlan.upsert({ where: { players }, update: b, create: { players, ...b } });
  await audit(req, "update", "gz-plan", String(players), b);
  send(res, row, "Plan saved");
}));
