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

// Tournament Organizer sign-in. The Unique Futsal ID is an email OR a mobile number. Two ways in:
//  1. an organizer account the venue made (ID = email or mobile number) with its own password;
//  2. the host's own customer login: the mobile number and password they use in the customer app, when a hosted tournament is registered
//     with that number as the host's contact. The first time, the organizer account is made for them and given every tournament hosted
//     under that number (later tournaments are added at their next sign-in).
// Only organizer accounts come in here; portal staff use /login.
const last10 = (v: string) => v.replace(/\D/g, "").slice(-10);
authRouter.post("/organizer-login", loginLimiter, handler(async (req, res) => {
  const { id, password } = parse(z.object({ id: z.string().trim().min(3).max(120), password: z.string().min(1) }), req.body);
  const isPhone = /^\+?[\d\s-]{10,17}$/.test(id);
  const key = isPhone ? last10(id) : id.toLowerCase();
  const fail = () => new AppError(401, "That ID or password is not right. Ask the venue if you are not sure.");

  let s = await prisma.staffUser.findUnique({ where: { email: key } });
  if (s && s.role !== "organizer") throw fail(); // portal staff do not come in here
  let ok = await bcrypt.compare(password, s?.passwordHash ?? DUMMY_HASH);

  if (!ok && isPhone) {
    // the host's customer login
    const customer = await prisma.user.findUnique({ where: { phoneNumber: key } });
    const okCustomer = await bcrypt.compare(password, customer?.password ?? DUMMY_HASH);
    if (customer && customer.isActive && okCustomer) {
      const hosted = (await prisma.tournament.findMany({ where: { hostedEvent: true, status: { not: "cancelled" } }, select: { id: true, hostPhone: true, hostName: true } })).filter((t) => t.hostPhone && last10(t.hostPhone) === key);
      if (hosted.length === 0) throw new AppError(403, "No tournament is registered for this number yet. Ask the venue to register it with your contact number.");
      if (!s) s = await prisma.staffUser.create({ data: { email: key, name: customer.name?.trim() || hosted[0].hostName || key, role: "organizer", permissions: [], passwordHash: customer.password } });
      await prisma.tournamentOrganizer.createMany({ data: hosted.map((t) => ({ staffId: s!.id, tournamentId: t.id })), skipDuplicates: true });
      ok = true;
    }
  }
  if (!s || !ok || !s.isActive) throw fail();
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
