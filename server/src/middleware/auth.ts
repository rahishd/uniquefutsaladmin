import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env";
import { prisma } from "../db";
import { AppError } from "../lib/http";
import { Permission, effectivePermissions } from "../lib/permissions";

export interface Staff { id: string; email: string; name: string; role: string; permissions: Permission[] }
declare module "express-serve-static-core" {
  interface Request { staff?: Staff }
}

export const signStaffToken = (s: { id: string; role: string; sessionVersion?: number }) =>
  jwt.sign({ id: s.id, role: s.role, v: s.sessionVersion ?? 0, aud: "admin" }, env.ADMIN_JWT_SECRET, { expiresIn: env.ADMIN_JWT_EXPIRE as jwt.SignOptions["expiresIn"] });

// A valid ADMIN token is required. Customer tokens (different secret and audience) never pass.
// The account is re-read on every request, so disabling a staff member or changing what they may do takes effect immediately.
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new AppError(401, "Sign in required");
    let id: string;
    let version = 0;
    try {
      const p = jwt.verify(token, env.ADMIN_JWT_SECRET, { audience: "admin" }) as { id: string; v?: number };
      id = p.id;
      version = p.v ?? 0;
    } catch {
      throw new AppError(401, "Session expired, sign in again");
    }
    const s = await prisma.staffUser.findUnique({ where: { id } });
    if (!s || !s.isActive) throw new AppError(401, "Account disabled");
    // a password change signs out every session that started before it
    if (version !== s.sessionVersion) throw new AppError(401, "Your password was changed. Sign in again");
    req.staff = { id: s.id, email: s.email, name: s.name, role: s.role, permissions: effectivePermissions(s) };
    next();
  } catch (e) {
    next(e);
  }
}

export const requirePermission = (p: Permission) => (req: Request, _res: Response, next: NextFunction) =>
  req.staff && req.staff.permissions.includes(p) ? next() : next(new AppError(403, "You do not have permission for this"));
