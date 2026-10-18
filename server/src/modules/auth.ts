import bcrypt from "bcryptjs";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
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
  // Guessing protection is for the real site only: no limit while developing or testing, so you are never locked out of your own machine.
  skip: () => process.env.NODE_ENV !== "production",
  handler: (_req, res) => { res.status(429).json({ success: false, statusCode: 429, message: "Too many sign-in attempts. Try again in 15 minutes." }); },
});

const view = (s: { id: string; email: string; name: string; role: string; permissions: string[]; avatar?: string | null }) => ({
  id: s.id, email: s.email, name: s.name, role: s.role, isAdmin: isAdminRole(s.role), isOwner: isOwnerRole(s.role),
  permissions: effectivePermissions(s), avatar: s.avatar ?? null,
});

// Profile pictures: the same checks as the site pictures (really decoded, rotated, location data dropped), cut to a small square.
const PICTURE = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i;
async function avatarFrom(dataUrl: string) {
  const m = PICTURE.exec(dataUrl.trim());
  if (!m) throw new AppError(400, "The picture must be a JPG, PNG or WebP image.");
  const raw = Buffer.from(m[1], "base64");
  if (raw.length === 0 || raw.length > 8 * 1024 * 1024) throw new AppError(400, "The picture is too large. The limit is 8 MB.");
  try {
    const data = await sharp(raw, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: 256, height: 256, fit: "cover" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  } catch {
    throw new AppError(400, "That picture could not be read. Please choose a different image.");
  }
}

authRouter.post("/login", loginLimiter, handler(async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const s = await prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, s?.passwordHash ?? DUMMY_HASH);
  if (!s || !ok || !s.isActive) throw new AppError(401, "Invalid email or password");
  await prisma.staffUser.update({ where: { id: s.id }, data: { lastLoginAt: new Date() } });
  req.staff = { id: s.id, email: s.email, name: s.name, role: s.role, permissions: effectivePermissions(s) };
  await audit(req, "login", "staff", s.id);
  send(res, { token: signStaffToken({ ...req.staff, sessionVersion: s.sessionVersion }), admin: view(s) }, "Signed in");
}));

authRouter.get("/me", requireStaff, handler(async (req, res) => {
  const s = await prisma.staffUser.findUniqueOrThrow({ where: { id: req.staff!.id }, select: { avatar: true } });
  send(res, view({ ...req.staff!, permissions: req.staff!.permissions, avatar: s.avatar }));
}));

// Own profile picture. Send { image: <data URL> } to set it, or { image: null } to remove it. Pictures are larger than the usual body limit.
authRouter.post("/avatar", express.json({ limit: "14mb" }), requireStaff, handler(async (req, res) => {
  const { image } = parse(z.object({ image: z.string().nullable() }), req.body);
  const avatar = image ? await avatarFrom(image) : null;
  await prisma.staffUser.update({ where: { id: req.staff!.id }, data: { avatar } });
  send(res, { avatar }, avatar ? "Profile picture updated" : "Profile picture removed");
}));

authRouter.post("/change-password", requireStaff, handler(async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string(), next: z.string().min(10, "at least 10 characters") }), req.body);
  const s = await prisma.staffUser.findUniqueOrThrow({ where: { id: req.staff!.id } });
  if (!(await bcrypt.compare(current, s.passwordHash))) throw new AppError(400, "Current password is wrong");
  const updated = await prisma.staffUser.update({ where: { id: s.id }, data: { passwordHash: await bcrypt.hash(next, 12), sessionVersion: { increment: 1 } } });
  await audit(req, "change-password", "staff", s.id);
  // every other device is signed out; this one gets a fresh token so the person stays signed in here
  send(res, { token: signStaffToken({ ...req.staff!, sessionVersion: updated.sessionVersion }) }, "Password changed");
}));
