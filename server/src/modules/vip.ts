// VIP privilege: staff pick a customer and give them a special code (for example VIPK7M3Q, or just VIP) worth a percent or
// rupees off. The customer types it once when booking; after that the customer app applies it to every game they book.
// One code per customer. Changing or removing a code for one customer also works from the Customers page
// (PUT/DELETE /customers/:phone/vip); this module is the VIP page: the list, the totals and creating new ones.
import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, page, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getPromoCodes } from "./settings-store";

export const vipRouter = Router();

const DEAD = ["cancelled", "expired"];
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I, easy to read out over the phone

// A fresh code like VIPK7M3Q that no customer has and no normal promo code uses.
async function freshCode(): Promise<string> {
  const promos = new Set((await getPromoCodes()).map((p) => p.code.trim().toUpperCase()));
  for (let i = 0; i < 20; i++) {
    const code = "VIP" + Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!promos.has(code) && !(await prisma.vipCode.findFirst({ where: { code }, select: { id: true } }))) return code;
  }
  throw new AppError(500, "Could not make a new code, try again");
}

vipRouter.get("/generate-code", requirePermission("vip.view"), handler(async (_req, res) => send(res, { code: await freshCode() })));

type Row = Prisma.VipCodeGetPayload<object>;

async function enrich(rows: Row[]) {
  const phones = rows.map((r) => r.userId);
  const [users, usage] = await Promise.all([
    prisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { phoneNumber: true, name: true, isActive: true } }),
    rows.length === 0 ? [] : prisma.booking.groupBy({
      by: ["userId", "promoCode"],
      where: { userId: { in: phones }, promoCode: { in: [...new Set(rows.map((r) => r.code))] }, status: { notIn: DEAD } },
      _count: { _all: true }, _sum: { discountAmount: true },
    }),
  ]);
  const u = new Map(users.map((x) => [x.phoneNumber, x]));
  const use = new Map(usage.map((x) => [`${x.userId}|${x.promoCode}`, x]));
  return rows.map((r) => {
    const g = use.get(`${r.userId}|${r.code}`);
    return {
      phone: r.userId, customerName: u.get(r.userId)?.name ?? null, accountActive: u.get(r.userId)?.isActive ?? true,
      code: r.code, type: r.type, value: r.value, active: r.active, note: r.note, claimedAt: r.claimedAt, createdAt: r.createdAt,
      usage: { games: g?._count._all ?? 0, discountGiven: g?._sum.discountAmount ?? 0 },
    };
  });
}

vipRouter.get("/", requirePermission("vip.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const text = q.q?.trim().slice(0, 60);
  const byName = text ? await prisma.user.findMany({ where: { name: { contains: text, mode: "insensitive" } }, select: { phoneNumber: true }, take: 50 }) : [];
  const where: Prisma.VipCodeWhereInput = {
    ...(q.status === "active" ? { active: true } : q.status === "paused" ? { active: false } : q.status === "unclaimed" ? { claimedAt: null } : {}),
    ...(text ? { OR: [{ code: { contains: text, mode: "insensitive" } }, { note: { contains: text, mode: "insensitive" } }, { userId: { contains: text } }, { userId: { in: byName.map((u) => u.phoneNumber) } }] } : {}),
  };
  const [rows, total, all] = await Promise.all([
    prisma.vipCode.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.vipCode.count({ where }),
    prisma.vipCode.findMany(), // VIP customers are few, so the totals can be worked out from all of them
  ]);
  const every = await enrich(all);
  send(res, {
    items: await enrich(rows), total, page: pageNo, limit,
    totals: {
      customers: all.length, active: all.filter((v) => v.active).length, paused: all.filter((v) => !v.active).length, entered: all.filter((v) => v.claimedAt).length,
      games: every.reduce((n, v) => n + v.usage.games, 0), discountGiven: every.reduce((n, v) => n + v.usage.discountGiven, 0),
    },
  });
}));

const create = z.object({
  phone: z.string().regex(/^9\d{9}$/, "a registered mobile number like 98XXXXXXXX"),
  code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/, "letters and numbers only").transform((c) => c.toUpperCase()).optional(),
  type: z.enum(["percent", "flat"]),
  value: z.number().int().min(1, "at least 1"),
  note: z.string().trim().max(120).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.type === "percent" && v.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "a percent cannot be more than 100" });
  if (v.type === "flat" && v.value > 100000) ctx.addIssue({ code: "custom", path: ["value"], message: "at most Rs. 100,000" });
});

vipRouter.post("/", requirePermission("vip.manage"), handler(async (req, res) => {
  const b = parse(create, req.body);
  const user = await prisma.user.findUnique({ where: { phoneNumber: b.phone }, select: { role: true, name: true } });
  if (!user) throw new AppError(404, "No registered customer with this number");
  if (user.role !== "user") throw new AppError(403, "Only customers can have a VIP code");
  if (await prisma.vipCode.findUnique({ where: { userId: b.phone } })) throw new AppError(409, "This customer already has a VIP code. Change it instead.");
  const code = b.code ?? (await freshCode());
  if ((await getPromoCodes()).some((p) => p.code.trim().toUpperCase() === code)) throw new AppError(409, "That is already a normal promo code. Choose a different VIP code.");
  const row = await prisma.vipCode.create({ data: { userId: b.phone, code, type: b.type, value: b.value, note: b.note ?? null, createdBy: req.staff!.id } });
  await audit(req, "vip-give", "customer", b.phone, { code, type: b.type, value: b.value, generated: !b.code });
  const [item] = await enrich([row]);
  send(res, item, "VIP privilege given", 201);
}));
