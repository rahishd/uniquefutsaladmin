import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getPromoCodes, PromoCode, setSetting } from "./settings-store";

export const promosRouter = Router();

const promo = z.object({
  code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/, "letters and numbers only").transform((s) => s.toUpperCase()),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive(),
  label: z.string().min(2).max(40),
  title: z.string().max(60).optional(),
  description: z.string().max(200).optional(),
  expiryDate: dateStr.optional(),
  validDays: z.array(z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive: z.boolean().default(true),
  appliedTo: z.enum(["booking", "membership", "both"]).default("booking"),
}).refine((p) => p.type !== "percent" || p.value <= 100, { message: "A percent discount cannot be more than 100", path: ["value"] });

// The customer app reads promo codes from Settings and validates again at checkout, so this only stores them.
promosRouter.get("/", requirePermission("promos.read"), handler(async (_req, res) => send(res, await getPromoCodes())));

promosRouter.post("/", requirePermission("promos.write"), handler(async (req, res) => {
  const p = parse(promo, req.body) as PromoCode;
  const all = await getPromoCodes();
  if (all.some((x) => x.code.toUpperCase() === p.code)) throw new AppError(409, "This code already exists");
  await setSetting("promoCodes", JSON.stringify([...all, p]));
  await audit(req, "create", "promo", p.code, p);
  send(res, p, "Promo created", 201);
}));

promosRouter.put("/:code", requirePermission("promos.write"), handler(async (req, res) => {
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

promosRouter.delete("/:code", requirePermission("promos.write"), handler(async (req, res) => {
  const code = param(req, "code").toUpperCase();
  const all = await getPromoCodes();
  if (!all.some((x) => x.code.toUpperCase() === code)) throw new AppError(404, "Promo not found");
  await setSetting("promoCodes", JSON.stringify(all.filter((x) => x.code.toUpperCase() !== code)));
  await audit(req, "delete", "promo", code);
  send(res, null, "Promo removed");
}));

// How often each code was used on real (not cancelled) bookings, and the discount given.
promosRouter.get("/usage", requirePermission("reports.read"), handler(async (_req, res) => {
  const rows = await prisma.booking.groupBy({ by: ["promoCode"], where: { promoCode: { not: null }, status: { notIn: ["cancelled", "expired"] } }, _count: { _all: true }, _sum: { discountAmount: true } });
  send(res, rows.map((r) => ({ code: r.promoCode, uses: r._count._all, discountGiven: r._sum.discountAmount ?? 0 })));
}));
