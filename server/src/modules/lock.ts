// Portal lock: when the counter is left alone (a coffee break), anyone on the desk can lock the screen and only a person who knows the
// 4 digit code can open it again. The code is set, changed and switched off by the Owner or an Admin only; staff can lock and unlock.
// Stored hashed in Settings under "portalLockCode". Locking itself is a screen cover in the portal; this module keeps the code and checks guesses.
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit } from "../lib/audit";
import { AppError, handler, parse, send } from "../lib/http";
import { isAdminRole } from "../lib/permissions";
import { getSetting, setSetting } from "./settings-store";
import { prisma } from "../db";

export const lockRouter = Router();

const KEY = "portalLockCode";
const code = z.string().regex(/^\d{4}$/, "The code must be exactly 4 digits.");

// 4 digits are easy to guess, so wrong tries are limited: 8 wrong codes in 5 minutes per person, then a wait.
// (Off while developing, so you are never locked out of your own machine, like the sign-in limit.)
const guessLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.staff?.id ?? "anonymous",
  skip: () => process.env.NODE_ENV !== "production",
  handler: (_req, res) => { res.status(429).json({ success: false, statusCode: 429, message: "Too many wrong codes. Wait 5 minutes, or ask an Admin." }); },
});

const adminOnly = (staff: { role: string } | undefined) => {
  if (!staff || !isAdminRole(staff.role)) throw new AppError(403, "Only the Owner or an Admin can change the lock code.");
};

// is a code set, and may this person change it
lockRouter.get("/", handler(async (req, res) => {
  send(res, { hasCode: !!(await getSetting(KEY)), canManage: !!req.staff && isAdminRole(req.staff.role) });
}));

// set or change the code (Owner or Admin)
lockRouter.put("/code", handler(async (req, res) => {
  adminOnly(req.staff);
  const b = parse(z.object({ code }), req.body);
  await setSetting(KEY, await bcrypt.hash(b.code, 10));
  await audit(req, "update", "portal_lock_code", null, { changed: true }); // never the code itself
  send(res, { hasCode: true }, "Lock code saved.");
}));

// switch the lock code off (Owner or Admin): nobody can lock the portal until a new code is set
lockRouter.delete("/code", handler(async (req, res) => {
  adminOnly(req.staff);
  await prisma.settings.deleteMany({ where: { key: KEY } });
  await audit(req, "delete", "portal_lock_code", null, {});
  send(res, { hasCode: false }, "Lock code removed.");
}));

// check a code to open the lock (any signed-in person)
lockRouter.post("/unlock", guessLimiter, handler(async (req, res) => {
  const b = parse(z.object({ code }), req.body);
  const hash = await getSetting(KEY);
  if (!hash) return send(res, { ok: true }, "No lock code is set.");
  if (!(await bcrypt.compare(b.code, hash))) throw new AppError(400, "That code is not right.");
  send(res, { ok: true }, "Unlocked.");
}));
