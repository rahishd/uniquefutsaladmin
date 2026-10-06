import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, parse, send } from "../lib/http";
import { effectivePermissions, isAdminRole, isOwnerRole } from "../lib/permissions";
import { requireStaff, signStaffToken } from "../middleware/auth";

export const authRouter = Router();

// A fixed hash so an unknown email takes as long to reject as a wrong password (no account probing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: (_req, res) => { res.status(429).json({ success: false, statusCode: 429, message: "Too many sign-in attempts. Try again in 15 minutes." }); },
});

const view = (s: { id: string; email: string; name: string; role: string; permissions: string[] }) => ({
  id: s.id, email: s.email, name: s.name, role: s.role, isAdmin: isAdminRole(s.role), isOwner: isOwnerRole(s.role),
  permissions: effectivePermissions(s),
});

authRouter.post("/login", loginLimiter, handler(async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const s = await prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, s?.passwordHash ?? DUMMY_HASH);
  if (!s || !ok || !s.isActive) throw new AppError(401, "Invalid email or password");
  await prisma.staffUser.update({ where: { id: s.id }, data: { lastLoginAt: new Date() } });
  req.staff = { id: s.id, email: s.email, name: s.name, role: s.role, permissions: effectivePermissions(s) };
  await audit(req, "login", "staff", s.id);
  send(res, { token: signStaffToken(req.staff), admin: view(s) }, "Signed in");
}));

authRouter.get("/me", requireStaff, handler(async (req, res) => send(res, view({ ...req.staff!, permissions: req.staff!.permissions }))));

authRouter.post("/change-password", requireStaff, handler(async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string(), next: z.string().min(10, "at least 10 characters") }), req.body);
  const s = await prisma.staffUser.findUniqueOrThrow({ where: { id: req.staff!.id } });
  if (!(await bcrypt.compare(current, s.passwordHash))) throw new AppError(400, "Current password is wrong");
  await prisma.staffUser.update({ where: { id: s.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  await audit(req, "change-password", "staff", s.id);
  send(res, null, "Password changed");
}));
