// Membership plans and their price matrix: shift (morning / day / evening) x length (1, 3 or 6 months).
// A cell holds a price and an optional rupee discount; the customer pays price - discount. An empty price means "not offered".
// Plans are never deleted (subscriptions point at them): retire a plan with isActive=false.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const membershipPlansRouter = Router();

const SHIFTS = ["morning", "day", "evening"] as const;
const LENGTHS = ["1_month", "3_months", "6_months"] as const;
type Shift = (typeof SHIFTS)[number];
type Length = (typeof LENGTHS)[number];

const colPart = (l: Length) => (l === "1_month" ? "1Month" : l === "3_months" ? "3Months" : "6Months");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const priceCol = (s: Shift, l: Length) => `price${colPart(l)}${cap(s)}`;
const discountCol = (s: Shift, l: Length) => `discount${colPart(l)}${cap(s)}`;

const cell = z.object({ price: z.number().int().min(100, "at least Rs. 100").max(1_000_000).nullable(), discount: z.number().int().min(0).max(1_000_000).default(0) })
  .refine((c) => c.price === null || c.discount < c.price, { message: "the discount must be less than the price", path: ["discount"] });
const row = z.object({ "1_month": cell, "3_months": cell, "6_months": cell });
const body = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  perks: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  featured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  matrix: z.object({ morning: row, day: row, evening: row }),
});
type Body = z.infer<typeof body>;

type PlanRow = Prisma.MembershipPlanGetPayload<object>;

function view(p: PlanRow, subscribers = 0) {
  const rec = p as unknown as Record<string, number | null>;
  const matrix = Object.fromEntries(SHIFTS.map((s) => [s, Object.fromEntries(LENGTHS.map((l) => {
    const price = rec[priceCol(s, l)] ?? null;
    const discount = rec[discountCol(s, l)] ?? 0;
    return [l, { price, discount, customerPays: price === null ? null : Math.max(0, price - discount) }];
  }))]));
  let perks: string[] = [];
  try { perks = JSON.parse(p.perks); } catch { /* old plans may store plain text */ }
  return { id: p.id, name: p.name, description: p.description, perks, featured: p.featured, isActive: p.isActive, matrix, activeSubscribers: subscribers, updatedAt: p.updatedAt };
}

function columns(b: Body) {
  const data: Record<string, number | null> = {};
  for (const s of SHIFTS) for (const l of LENGTHS) {
    const c = b.matrix[s][l];
    data[priceCol(s, l)] = c.price;
    data[discountCol(s, l)] = c.price === null ? 0 : c.discount;
  }
  return data;
}

// The old `price` column is still required and the customer app lists plans cheapest first by it: use the cheapest 1-month price.
const legacyPrice = (b: Body) => Math.min(...SHIFTS.map((s) => b.matrix[s]["1_month"].price).filter((x): x is number => x !== null), Infinity);

function check(b: Body) {
  const offered = SHIFTS.some((s) => LENGTHS.some((l) => b.matrix[s][l].price !== null));
  if (b.isActive && !offered) throw new AppError(400, "Set at least one price before making the plan active");
}

membershipPlansRouter.get("/plans", requirePermission("membership.read"), handler(async (_req, res) => {
  const plans = await prisma.membershipPlan.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] });
  const subs = await prisma.membershipSubscription.groupBy({ by: ["planId"], where: { status: "active", endDate: { gte: new Date() } }, _count: { _all: true } });
  const n = new Map(subs.map((s) => [s.planId, s._count._all]));
  send(res, plans.map((p) => view(p, n.get(p.id) ?? 0)));
}));

membershipPlansRouter.post("/plans", requirePermission("membership.write"), handler(async (req, res) => {
  const b = parse(body, req.body);
  check(b);
  const created = await prisma.$transaction(async (tx) => {
    if (b.featured) await tx.membershipPlan.updateMany({ data: { featured: false } });
    return tx.membershipPlan.create({
      data: { name: b.name, description: b.description ?? null, perks: JSON.stringify(b.perks), featured: b.featured, isActive: b.isActive, price: Number.isFinite(legacyPrice(b)) ? legacyPrice(b) : 0, ...columns(b) },
    });
  });
  await audit(req, "create", "membership-plan", created.id, { name: b.name, isActive: b.isActive });
  send(res, view(created), "Plan created", 201);
}));

membershipPlansRouter.put("/plans/:id", requirePermission("membership.write"), handler(async (req, res) => {
  const id = param(req, "id");
  const b = parse(body, req.body);
  check(b);
  if (!(await prisma.membershipPlan.findUnique({ where: { id } }))) throw new AppError(404, "Plan not found");
  const updated = await prisma.$transaction(async (tx) => {
    if (b.featured) await tx.membershipPlan.updateMany({ where: { id: { not: id } }, data: { featured: false } });
    return tx.membershipPlan.update({
      where: { id },
      data: { name: b.name, description: b.description ?? null, perks: JSON.stringify(b.perks), featured: b.featured, isActive: b.isActive, price: Number.isFinite(legacyPrice(b)) ? legacyPrice(b) : 0, ...columns(b) },
    });
  });
  // Prices change only for NEW requests: existing subscriptions keep the price they were sold at (totalPrice is stored on them).
  await audit(req, "update", "membership-plan", id, { name: b.name, isActive: b.isActive, featured: b.featured, matrix: b.matrix });
  send(res, view(updated), "Plan saved");
}));
