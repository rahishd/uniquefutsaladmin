import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, param, parse, send } from "../lib/http";
import { ACCOUNT_TYPES, ASSIGNABLE, PRESETS, SECTIONS, effectivePermissions, isAdminRole } from "../lib/permissions";
import { requirePermission, signStaffToken } from "../middleware/auth";

// Accounts. ONLY THE OWNER can open this (the "staff.manage" permission belongs to the owner alone): add admin and staff accounts and
// choose, one small permission at a time, what each staff member may do. Admins have every permission except this one.
export const staffRouter = Router();
staffRouter.use(requirePermission("staff.manage"));

const pub = { id: true, email: true, name: true, role: true, permissions: true, isActive: true, lastLoginAt: true, createdAt: true } as const;
const password = z.string().min(10, "at least 10 characters");
const permissions = z.array(z.string()).max(60).transform((list) => [...new Set(list)]).superRefine((list, ctx) => {
  const bad = list.filter((p) => !(ASSIGNABLE as string[]).includes(p));
  if (bad.length) ctx.addIssue({ code: "custom", message: `not something staff can be given: ${bad.join(", ")}` });
});

type Row = { id: string; email: string; name: string; role: string; permissions: string[]; isActive: boolean; lastLoginAt: Date | null; createdAt: Date };
const view = (s: Row, tournamentIds: string[] = []) => ({
  ...s,
  accountType: isAdminRole(s.role) ? "admin" : s.role === "organizer" ? "organizer" : "staff",
  legacyRole: !isAdminRole(s.role) && s.role !== "staff" && s.role !== "organizer", // an older fixed role; editing it turns it into a normal Staff account
  effective: effectivePermissions(s),
  tournamentIds, // organizers: the hosted tournaments they may open
});

// the hosted tournaments given to each organizer account
async function assigned(ids: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.tournamentOrganizer.findMany({ where: { staffId: { in: ids } }, select: { staffId: true, tournamentId: true } });
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.staffId, [...(m.get(r.staffId) ?? []), r.tournamentId]);
  return m;
}
const tournamentIds = z.array(z.string().min(1)).max(50).transform((l) => [...new Set(l)]);
async function setAssignments(staffId: string, ids: string[]) {
  if (ids.length) {
    const ok = await prisma.tournament.findMany({ where: { id: { in: ids }, hostedEvent: true }, select: { id: true } });
    if (ok.length !== ids.length) throw new AppError(400, "Choose hosted tournaments only");
  }
  await prisma.$transaction([
    prisma.tournamentOrganizer.deleteMany({ where: { staffId } }),
    prisma.tournamentOrganizer.createMany({ data: ids.map((tournamentId) => ({ staffId, tournamentId })), skipDuplicates: true }),
  ]);
}

// What the form shows: the permission sections with their tick boxes, and the quick-start presets
staffRouter.get("/catalog", handler(async (_req, res) => send(res, { sections: SECTIONS, presets: PRESETS, assignable: ASSIGNABLE })));

staffRouter.get("/", handler(async (_req, res) => {
  const rows = await prisma.staffUser.findMany({ select: pub, orderBy: { createdAt: "asc" } });
  const t = await assigned(rows.map((r) => r.id));
  send(res, rows.map((r) => view(r, t.get(r.id))));
}));

staffRouter.post("/", handler(async (req, res) => {
  const b = parse(z.object({
    email: z.string().trim().min(5).max(120), name: z.string().trim().min(2).max(60), accountType: z.enum(ACCOUNT_TYPES), password,
    permissions: permissions.default([]), tournamentIds: tournamentIds.default([]),
  }), req.body);
  // the sign-in ID is an email; a Tournament Organizer may use a 10 digit mobile number instead
  const phoneId = b.accountType === "organizer" && /^\+?[\d\s-]{10,17}$/.test(b.email) ? b.email.replace(/\D/g, "").slice(-10) : null;
  if (!phoneId && !z.string().email().safeParse(b.email).success) throw new AppError(400, "email: Invalid email");
  const email = phoneId ?? b.email.toLowerCase();
  if (await prisma.staffUser.findUnique({ where: { email } })) throw new AppError(409, "An account with this email already exists");
  const s = await prisma.staffUser.create({
    data: { email, name: b.name, role: b.accountType, permissions: b.accountType === "staff" ? b.permissions : [], passwordHash: await bcrypt.hash(b.password, 12) },
    select: pub,
  });
  if (b.accountType === "organizer") await setAssignments(s.id, b.tournamentIds);
  await audit(req, "create", "staff", s.id, { email, accountType: b.accountType, permissions: s.permissions, ...(b.accountType === "organizer" ? { tournamentIds: b.tournamentIds } : {}) });
  send(res, view(s, b.accountType === "organizer" ? b.tournamentIds : []), "Account created", 201);
}));

staffRouter.patch("/:id", handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(z.object({
    name: z.string().trim().min(2).max(60).optional(), email: z.string().trim().email().optional(), accountType: z.enum(ACCOUNT_TYPES).optional(), permissions: permissions.optional(), tournamentIds: tournamentIds.optional(),
    isActive: z.boolean().optional(), password: password.optional(),
  }), req.body);
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "Account not found");
  const me = req.staff!;
  // The owner account can only be changed by an owner.
  if (target.role === "owner" && me.role !== "owner") throw new AppError(403, "Only the owner can change the owner account");
  const demotes = b.accountType === "staff" && isAdminRole(target.role);
  // Never lock the business out: you cannot demote or disable yourself, and one active owner must always remain.
  if (id === me.id && (demotes || b.isActive === false)) throw new AppError(400, "You cannot change your own access or disable yourself");
  const losesOwner = target.role === "owner" && target.isActive && (demotes || b.isActive === false);
  if (losesOwner && (await prisma.staffUser.count({ where: { role: "owner", isActive: true } })) <= 1) throw new AppError(400, "At least one active owner is required");

  const becomesStaff = b.accountType === "staff" || (b.accountType === undefined && !isAdminRole(target.role) && target.role !== "organizer");
  const newEmail = b.email?.toLowerCase();
  if (newEmail && newEmail !== target.email && (await prisma.staffUser.findUnique({ where: { email: newEmail } }))) throw new AppError(409, "Another account already uses this email");
  const data: Record<string, unknown> = { name: b.name, isActive: b.isActive, ...(newEmail ? { email: newEmail } : {}) };
  if (b.accountType === "admin" && target.role !== "owner") { data.role = "admin"; data.permissions = []; }
  else if (b.accountType === "organizer" && target.role !== "owner") { data.role = "organizer"; data.permissions = []; }
  else if (b.accountType === "staff") { data.role = "staff"; data.permissions = b.permissions ?? (isAdminRole(target.role) ? [] : effectivePermissions(target).filter((p) => (ASSIGNABLE as string[]).includes(p))); }
  else if (b.permissions && becomesStaff) { data.role = "staff"; data.permissions = b.permissions; }
  else if (b.permissions && isAdminRole(target.role)) throw new AppError(400, "Admins already have all access. Change the account to Staff to choose what they can do.");
  if (b.password) data.passwordHash = await bcrypt.hash(b.password, 12);
  // a new password or a new login email signs the person out on every device
  const signsOut = !!b.password || (!!newEmail && newEmail !== target.email);
  if (signsOut) data.sessionVersion = { increment: 1 };

  const s = await prisma.staffUser.update({ where: { id }, data, select: pub });
  if (s.role === "organizer" && b.tournamentIds) await setAssignments(id, b.tournamentIds);
  const given = (await assigned([id])).get(id) ?? [];
  await audit(req, "update", "staff", id, {
    name: b.name, isActive: b.isActive, passwordChanged: !!b.password, ...(newEmail && newEmail !== target.email ? { email: { from: target.email, to: newEmail } } : {}),
    signedOut: signsOut, access: { before: effectivePermissions(target).length, after: effectivePermissions(s).length, role: s.role, permissions: s.permissions },
  });
  // you edited your own login: keep this device signed in with a fresh token (your other devices are signed out)
  if (signsOut && id === me.id) {
    const v = await prisma.staffUser.findUniqueOrThrow({ where: { id }, select: { sessionVersion: true } });
    return send(res, { ...view(s, given), token: signStaffToken({ id, role: s.role, sessionVersion: v.sessionVersion }) }, "Account updated");
  }
  send(res, view(s, given), "Account updated");
}));

// Delete an account for good. It stops working at once (every request re-reads the account). The audit log keeps what they did.
staffRouter.delete("/:id", handler(async (req, res) => {
  const id = param(req, "id");
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "Account not found");
  const me = req.staff!;
  if (id === me.id) throw new AppError(400, "You cannot delete your own account");
  if (target.role === "owner") {
    if (me.role !== "owner") throw new AppError(403, "Only the owner can change the owner account");
    if (target.isActive && (await prisma.staffUser.count({ where: { role: "owner", isActive: true } })) <= 1) throw new AppError(400, "At least one active owner is required");
  }
  await prisma.staffUser.delete({ where: { id } });
  await audit(req, "delete", "staff", id, { email: target.email, name: target.name, role: target.role });
  send(res, null, "Account deleted");
}));
