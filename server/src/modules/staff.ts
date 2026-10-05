import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, param, parse, send } from "../lib/http";
import { ROLES } from "../lib/permissions";
import { requirePermission } from "../middleware/auth";

export const staffRouter = Router();
staffRouter.use(requirePermission("staff.manage"));

const pub = { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } as const;
const role = z.enum(ROLES);
const password = z.string().min(10, "at least 10 characters");

staffRouter.get("/", handler(async (_req, res) => send(res, await prisma.staffUser.findMany({ select: pub, orderBy: { createdAt: "asc" } }))));

staffRouter.post("/", handler(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), name: z.string().min(2), role, password }), req.body);
  const email = b.email.toLowerCase();
  if (await prisma.staffUser.findUnique({ where: { email } })) throw new AppError(409, "A staff account with this email already exists");
  const s = await prisma.staffUser.create({ data: { email, name: b.name, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) }, select: pub });
  await audit(req, "create", "staff", s.id, { email, role: b.role });
  send(res, s, "Staff account created", 201);
}));

staffRouter.patch("/:id", handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({ name: z.string().min(2).optional(), role: role.optional(), isActive: z.boolean().optional(), password: password.optional() }), req.body);
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "Staff account not found");
  // Never lock the business out: you cannot demote or disable yourself, and one active owner must always remain.
  if (id === req.staff!.id && (b.role !== undefined && b.role !== target.role || b.isActive === false)) throw new AppError(400, "You cannot change your own role or disable yourself");
  const losesOwner = target.role === "owner" && target.isActive && ((b.role && b.role !== "owner") || b.isActive === false);
  if (losesOwner && (await prisma.staffUser.count({ where: { role: "owner", isActive: true } })) <= 1) throw new AppError(400, "At least one active owner is required");
  const s = await prisma.staffUser.update({
    where: { id },
    data: { name: b.name, role: b.role, isActive: b.isActive, ...(b.password ? { passwordHash: await bcrypt.hash(b.password, 12) } : {}) },
    select: pub,
  });
  await audit(req, "update", "staff", id, { name: b.name, role: b.role, isActive: b.isActive, passwordChanged: !!b.password });
  send(res, s, "Staff account updated");
}));
