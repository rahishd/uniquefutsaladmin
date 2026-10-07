import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getPromoCodes, PromoCode, setSetting } from "./settings-store";

export const promosRouter = Router();

// The customer app compares the booking day with FULL names ("Saturday"), so days are always stored like that. Short names ("Sat") are accepted and converted.
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const day = z.string().transform((d, ctx) => { const full = FULL.find((f) => f.toLowerCase() === d.toLowerCase() || f.slice(0, 3).toLowerCase() === d.toLowerCase()); if (!full) { ctx.addIssue({ code: "custom", message: `"${d}" is not a day of the week` }); return z.NEVER; } return full; });

const promo = z.object({
  code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/, "letters and numbers only").transform((s) => s.toUpperCase()),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive(),
  label: z.string().min(2).max(40),
  title: z.string().max(60).optional(),
  description: z.string().max(200).optional(),
  expiryDate: dateStr.optional(),
  validDays: z.array(day).max(7).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive: z.boolean().default(true),
  maxUses: z.number().int().min(1, "At least 1").max(100000).optional(), // everyone together
  maxPerCustomer: z.number().int().min(1, "At least 1").max(1000).optional(),
  appliedTo: z.enum(["booking", "membership", "both"]).default("booking"),
}).refine((p) => p.type !== "percent" || p.value <= 100, { message: "A percent discount cannot be more than 100", path: ["value"] })
  .refine((p) => !p.maxUses || !p.maxPerCustomer || p.maxPerCustomer <= p.maxUses, { message: "The limit for one customer cannot be more than the total limit", path: ["maxPerCustomer"] })
  .refine((p) => !!p.startTime === !!p.endTime, { message: "Give both the start and the end time of the window, or neither", path: ["endTime"] })
  .refine((p) => !p.startTime || !p.endTime || p.startTime < p.endTime, { message: "The window must start before it ends", path: ["endTime"] });

// The customer app reads promo codes from Settings and validates again at checkout, so this only stores them.
// Each code with its state (active, paused, expired) and how often it was used on bookings and memberships that were not cancelled.
type Use = { uses: number; discountGiven: number; lastUsedAt: Date | null };
async function usage(): Promise<Map<string, Use>> {
  const out = new Map<string, Use>();
  const add = (code: string | null, uses: number, discount: number, last: Date | null) => {
    if (!code) return;
    const k = code.toUpperCase();
    const u = out.get(k) ?? { uses: 0, discountGiven: 0, lastUsedAt: null };
    u.uses += uses; u.discountGiven += discount;
    if (last && (!u.lastUsedAt || last > u.lastUsedAt)) u.lastUsedAt = last;
    out.set(k, u);
  };
  const live = { notIn: ["cancelled", "expired"] };
  for (const r of await prisma.booking.groupBy({ by: ["promoCode"], where: { promoCode: { not: null }, status: live }, _count: { _all: true }, _sum: { discountAmount: true }, _max: { createdAt: true } })) add(r.promoCode, r._count._all, Math.round(r._sum.discountAmount ?? 0), r._max.createdAt);
  for (const r of await prisma.membershipSubscription.groupBy({ by: ["promoCode"], where: { promoCode: { not: null }, status: { notIn: ["cancelled"] } }, _count: { _all: true }, _sum: { discountAmount: true }, _max: { createdAt: true } })) add(r.promoCode, r._count._all, Math.round(r._sum.discountAmount ?? 0), r._max.createdAt);
  return out;
}
// used up = the total limit has been reached; the customer app stops offering and accepting it
const stateOf = (p: PromoCode, today: string, uses: number): "active" | "paused" | "expired" | "used_up" => (p.expiryDate && p.expiryDate.slice(0, 10) < today ? "expired" : p.maxUses && uses >= p.maxUses ? "used_up" : p.isActive === false ? "paused" : "active");

// The customer app reads promo codes from Settings and validates again at checkout, so this only stores them.
promosRouter.get("/", requirePermission("promos.view"), handler(async (_req, res) => {
  const [all, use] = await Promise.all([getPromoCodes(), usage()]);
  const today = todayKey();
  send(res, all.map((p) => { const u = use.get(p.code.toUpperCase()) ?? { uses: 0, discountGiven: 0, lastUsedAt: null }; return { ...p, status: stateOf(p, today, u.uses), ...u }; }));
}));

promosRouter.post("/", requirePermission("promos.create"), handler(async (req, res) => {
  const p = parse(promo, req.body) as PromoCode;
  const all = await getPromoCodes();
  if (all.some((x) => x.code.toUpperCase() === p.code)) throw new AppError(409, "This code already exists");
  if (p.expiryDate && p.expiryDate < todayKey()) throw new AppError(400, "The expiry date has already passed");
  if (await prisma.vipCode.findFirst({ where: { code: { equals: p.code, mode: "insensitive" } }, select: { id: true } })) throw new AppError(409, "A VIP code already uses this name");
  await setSetting("promoCodes", JSON.stringify([...all, p]));
  await audit(req, "create", "promo", p.code, p);
  send(res, p, "Promo created", 201);
}));

promosRouter.put("/:code", requirePermission("promos.edit"), handler(async (req, res) => {
  const code = param(req, "code").toUpperCase();
  const p = parse(promo, { ...req.body, code }) as PromoCode;
  const all = await getPromoCodes();
  const i = all.findIndex((x) => x.code.toUpperCase() === code);
  if (i < 0) throw new AppError(404, "Promo not found");
  all[i] = p;
  await setSetting("promoCodes", JSON.stringify(all));
  await audit(req, "update", "promo", code, p);
  send(res, p, "Promo saved");
}));

promosRouter.patch("/:code/active", requirePermission("promos.edit"), handler(async (req, res) => {
  const code = param(req, "code").toUpperCase();
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const all = await getPromoCodes();
  const i = all.findIndex((x) => x.code.toUpperCase() === code);
  if (i < 0) throw new AppError(404, "Promo not found");
  all[i] = { ...all[i], isActive };
  await setSetting("promoCodes", JSON.stringify(all));
  await audit(req, isActive ? "resume" : "pause", "promo", code);
  send(res, all[i], isActive ? "Promo is live again" : "Promo paused");
}));

promosRouter.delete("/:code", requirePermission("promos.delete"), handler(async (req, res) => {
  const code = param(req, "code").toUpperCase();
  const all = await getPromoCodes();
  if (!all.some((x) => x.code.toUpperCase() === code)) throw new AppError(404, "Promo not found");
  await setSetting("promoCodes", JSON.stringify(all.filter((x) => x.code.toUpperCase() !== code)));
  await audit(req, "delete", "promo", code);
  send(res, null, "Promo removed");
}));

// How often each code was used on real (not cancelled) bookings, and the discount given.
promosRouter.get("/usage", requirePermission("reports.view"), handler(async (_req, res) => {
  const rows = await prisma.booking.groupBy({ by: ["promoCode"], where: { promoCode: { not: null }, status: { notIn: ["cancelled", "expired"] } }, _count: { _all: true }, _sum: { discountAmount: true } });
  send(res, rows.map((r) => ({ code: r.promoCode, uses: r._count._all, discountGiven: r._sum.discountAmount ?? 0 })));
}));
