import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const customersRouter = Router();

// Never send the password hash or Google ids.
const pub = { phoneNumber: true, name: true, email: true, isActive: true, createdAt: true, freeMatchesAvailable: true, isVerified: true, avatar: true } as const;

customersRouter.get("/", requirePermission("customers.read"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const where: Prisma.UserWhereInput = {
    role: "user",
    ...(q.status === "suspended" ? { isActive: false } : q.status === "active" ? { isActive: true } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phoneNumber: { contains: q.q } }, { email: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([prisma.user.findMany({ where, select: pub, orderBy: { createdAt: "desc" }, take, skip }), prisma.user.count({ where })]);
  send(res, { items, total, page: pageNo, limit });
}));

customersRouter.get("/:phone", requirePermission("customers.read"), handler(async (req, res) => {
  const phone = param(req, "phone");
  const user = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: pub });
  if (!user) throw new AppError(404, "Customer not found");
  const [prefs, bookings, gz, ledger, vouchers, member] = await Promise.all([
    prisma.userPrefs.findUnique({ where: { userId: phone } }),
    prisma.booking.findMany({ where: { OR: [{ userId: phone }, { customerPhone: phone }] }, orderBy: [{ date: "desc" }, { startTime: "desc" }], take: 30 }),
    prisma.gzBooking.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.loyaltyEntry.findMany({ where: { userId: phone }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.freeGameVoucher.findMany({ where: { userId: phone }, orderBy: { claimedAt: "desc" }, take: 20 }),
    prisma.teamMember.findUnique({ where: { userId: phone }, include: { team: true } }),
  ]);
  const points = ledger.reduce((n, e) => n + Number(e.points), 0);
  send(res, { user, prefs, bookings, gamezone: gz, loyalty: { balanceBeforeExpiry: Math.round(points * 10) / 10, ledger, vouchers }, team: member?.team ?? null });
}));

customersRouter.patch("/:phone", requirePermission("customers.write"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(60).optional(), email: z.string().email().nullable().optional() }), req.body);
  const phone = param(req, "phone");
  if (!(await prisma.user.findUnique({ where: { phoneNumber: phone } }))) throw new AppError(404, "Customer not found");
  try {
    const u = await prisma.user.update({ where: { phoneNumber: phone }, data: b, select: pub });
    await audit(req, "update", "customer", phone, b);
    send(res, u, "Customer updated");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "That email is used by another account");
    throw e;
  }
}));

async function setActive(req: import("express").Request, active: boolean) {
  const phone = param(req, "phone");
  const u = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  if (!u) throw new AppError(404, "Customer not found");
  if (u.role !== "user") throw new AppError(403, "Staff and admin accounts are managed under Staff");
  await prisma.user.update({ where: { phoneNumber: phone }, data: { isActive: active } });
  await audit(req, active ? "unsuspend" : "suspend", "customer", phone);
}

customersRouter.post("/:phone/suspend", requirePermission("customers.write"), handler(async (req, res) => { await setActive(req, false); send(res, null, "Customer suspended"); }));
customersRouter.post("/:phone/unsuspend", requirePermission("customers.write"), handler(async (req, res) => { await setActive(req, true); send(res, null, "Customer reactivated"); }));
