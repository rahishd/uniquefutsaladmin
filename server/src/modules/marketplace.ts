// Partner Marketplace. Businesses that are not Unique Futsal (cafes, swimming pools, restaurants ...) sign an agreement with the venue and give
// our customers a discount when they pay with loyalty points. Staff (here) register each partner, set the agreement dates, write the discount
// codes and say how many loyalty points each discount costs. The customer app lists the partners and lets a customer redeem points for a card
// with a code (customer server). The partner opens its own dashboard through a private link (no staff sign-in) to see which customers
// redeemed, check a card code, mark it used and change its banner.
import { randomBytes } from "crypto";
import express, { Request, Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { todayKey } from "../lib/dates";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { adStatus, saveMedia } from "./content";

export const marketplaceRouter = Router(); // staff, after sign-in
export const partnerDashboardRouter = Router(); // the partner, with the secret in its link

const newToken = () => randomBytes(24).toString("base64url");
const mediaPath = (id: string) => `/api/content/media/${id}`;
export const CATEGORIES = ["Cafe", "Restaurant", "Swimming pool", "Gym", "Salon & spa", "Shop", "Other"];

type PartnerRow = Prisma.MarketplacePartnerGetPayload<object>;
const statusOf = (p: { active: boolean; agreementStart: string; agreementEnd: string }, today = todayKey()) =>
  !p.active ? "paused" : today < p.agreementStart ? "waiting" : today > p.agreementEnd ? "ended" : "active";
const num = (d: Prisma.Decimal | number) => Number(d);

const offerView = (o: Prisma.MarketplaceOfferGetPayload<object>) => ({ id: o.id, title: o.title, code: o.code, discountText: o.discountText, pointsCost: num(o.pointsCost), maxPerCustomer: o.maxPerCustomer, active: o.active });
const mask = (phone: string) => (phone.length >= 6 ? `${phone.slice(0, 2)}****${phone.slice(-4)}` : phone);

const offerBody = z.object({
  title: z.string().trim().min(2, "Give the offer a title").max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "The discount code is 3 to 20 letters, digits or dashes"),
  discountText: z.string().trim().min(2, "Say what the customer gets, for example 10% off the bill").max(80),
  pointsCost: z.number().min(0.5, "At least half a point").max(100000).transform((n) => Math.round(n * 10) / 10),
  maxPerCustomer: z.number().int().min(1).max(100).nullish().transform((v) => v ?? null),
  active: z.boolean().default(true),
});
const partnerBody = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(80),
  category: z.string().trim().min(2, "Choose or type a category").max(40),
  contactName: z.string().trim().max(60).nullish().transform((v) => v || null),
  contactPhone: z.string().trim().max(20).nullish().transform((v) => v || null),
  about: z.string().trim().max(400).nullish().transform((v) => v || null),
  agreementStart: dateStr,
  agreementEnd: dateStr,
  active: z.boolean().default(true),
  image: z.string().nullish(),
  // when and how long the banner shows (the same controls as an ad)
  bannerSeconds: z.number().int().min(3, "3 to 60 seconds").max(60, "3 to 60 seconds").optional(),
  bannerPriority: z.number().int().min(0, "0 to 100").max(100, "0 to 100").optional(),
  bannerOn: z.boolean().optional(),
  bannerStart: dateStr.nullish(),
  bannerEnd: dateStr.nullish(),
  bannerDailyStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time like 09:30").nullish(),
  bannerDailyEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time like 09:30").nullish(),
  bannerDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).refine((b) => b.agreementEnd >= b.agreementStart, { message: "The agreement cannot end before it starts", path: ["agreementEnd"] });

async function view(p: PartnerRow) {
  const [offers, red] = await Promise.all([
    prisma.marketplaceOffer.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "asc" } }),
    prisma.marketplaceRedemption.groupBy({ by: ["status"], where: { partnerId: p.id }, _count: { _all: true } }),
  ]);
  const count = (s: string) => red.find((r) => r.status === s)?._count._all ?? 0;
  return {
    id: p.id, name: p.name, category: p.category, contactName: p.contactName, contactPhone: p.contactPhone, about: p.about,
    agreementStart: p.agreementStart, agreementEnd: p.agreementEnd, active: p.active, status: statusOf(p),
    bannerUrl: p.bannerMediaId ? mediaPath(p.bannerMediaId) : null,
    banner: {
      seconds: p.bannerSeconds, priority: p.bannerPriority, on: p.bannerOn, startDate: p.bannerStart, endDate: p.bannerEnd, dailyStart: p.bannerDailyStart, dailyEnd: p.bannerDailyEnd, days: p.bannerDays,
      status: adStatus({ active: p.bannerOn, startDate: p.bannerStart, endDate: p.bannerEnd, dailyStart: p.bannerDailyStart, dailyEnd: p.bannerDailyEnd, days: p.bannerDays }),
    },
    link: { token: p.token, active: p.tokenActive, lastSeenAt: p.lastSeenAt },
    offers: offers.map(offerView),
    stats: { active: count("active"), used: count("used"), cancelled: count("cancelled") },
  };
}
const find = async (id: string) => {
  const p = await prisma.marketplacePartner.findUnique({ where: { id } });
  if (!p) throw new AppError(404, "Partner not found");
  return p;
};

/* ====================== staff ====================== */
marketplaceRouter.use(express.json({ limit: "14mb" })); // a banner picture arrives as a data URL

marketplaceRouter.get("/", requirePermission("marketplace.view"), handler(async (_req, res) => {
  const rows = await prisma.marketplacePartner.findMany({ orderBy: { createdAt: "desc" } });
  send(res, { categories: CATEGORIES, items: await Promise.all(rows.map(view)) });
}));

marketplaceRouter.post("/", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const b = parse(partnerBody.and(z.object({ offers: z.array(offerBody).max(20).default([]) })), req.body);
  const codes = b.offers.map((o) => o.code);
  if (new Set(codes).size !== codes.length) throw new AppError(409, "Two offers use the same discount code");
  const media = b.image ? (await saveMedia(b.image, req.staff!.id)).media : null;
  const p = await prisma.marketplacePartner.create({
    data: {
      name: b.name, category: b.category, contactName: b.contactName, contactPhone: b.contactPhone, about: b.about, agreementStart: b.agreementStart, agreementEnd: b.agreementEnd,
      active: b.active, bannerMediaId: media?.id ?? null, token: newToken(), createdBy: req.staff!.id,
      offers: { create: b.offers.map((o) => ({ title: o.title, code: o.code, discountText: o.discountText, pointsCost: o.pointsCost, maxPerCustomer: o.maxPerCustomer, active: o.active })) },
    },
  });
  await audit(req, "create", "marketplace_partner", p.id, { name: p.name, category: p.category, offers: b.offers.length });
  send(res, await view(p), "Partner registered", 201);
}));

marketplaceRouter.patch("/:id", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const b = parse(partnerBody.innerType().partial().extend({ removeBanner: z.boolean().optional() }), req.body);
  const start = b.agreementStart ?? p.agreementStart;
  const end = b.agreementEnd ?? p.agreementEnd;
  if (end < start) throw new AppError(400, "The agreement cannot end before it starts");
  const bs = b.bannerStart !== undefined ? b.bannerStart : p.bannerStart;
  const be = b.bannerEnd !== undefined ? b.bannerEnd : p.bannerEnd;
  if (bs && be && be < bs) throw new AppError(400, "The banner's last day cannot be before its first day");
  const ds = b.bannerDailyStart !== undefined ? b.bannerDailyStart : p.bannerDailyStart;
  const de = b.bannerDailyEnd !== undefined ? b.bannerDailyEnd : p.bannerDailyEnd;
  if (ds && de && ds === de) throw new AppError(400, "The start and end time must be different");
  let bannerMediaId = p.bannerMediaId;
  let oldMedia: string | null = null;
  if (b.image) { bannerMediaId = (await saveMedia(b.image, req.staff!.id)).media.id; oldMedia = p.bannerMediaId; }
  else if (b.removeBanner) { bannerMediaId = null; oldMedia = p.bannerMediaId; }
  const upd = await prisma.marketplacePartner.update({
    where: { id: p.id },
    data: {
      ...(b.name !== undefined ? { name: b.name } : {}), ...(b.category !== undefined ? { category: b.category } : {}), ...(b.contactName !== undefined ? { contactName: b.contactName } : {}),
      ...(b.contactPhone !== undefined ? { contactPhone: b.contactPhone } : {}), ...(b.about !== undefined ? { about: b.about } : {}), agreementStart: start, agreementEnd: end,
      ...(b.active !== undefined ? { active: b.active } : {}), bannerMediaId,
      ...(b.bannerSeconds !== undefined ? { bannerSeconds: b.bannerSeconds } : {}), ...(b.bannerPriority !== undefined ? { bannerPriority: b.bannerPriority } : {}), ...(b.bannerOn !== undefined ? { bannerOn: b.bannerOn } : {}),
      ...(b.bannerStart !== undefined ? { bannerStart: b.bannerStart || null } : {}), ...(b.bannerEnd !== undefined ? { bannerEnd: b.bannerEnd || null } : {}),
      ...(b.bannerDailyStart !== undefined ? { bannerDailyStart: b.bannerDailyStart || null } : {}), ...(b.bannerDailyEnd !== undefined ? { bannerDailyEnd: b.bannerDailyEnd || null } : {}),
      ...(b.bannerDays !== undefined ? { bannerDays: [...new Set(b.bannerDays)].sort() } : {}),
    },
  });
  if (oldMedia) await prisma.contentMedia.deleteMany({ where: { id: oldMedia } });
  await audit(req, "update", "marketplace_partner", p.id, { name: upd.name, active: upd.active, agreementStart: start, agreementEnd: end });
  send(res, await view(upd), "Saved");
}));

// the dashboard link the partner receives: make a new one (the old one stops working) or switch it off
marketplaceRouter.post("/:id/link", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const upd = await prisma.marketplacePartner.update({ where: { id: p.id }, data: { token: newToken(), tokenActive: true, lastSeenAt: null } });
  await audit(req, "link", "marketplace_partner", p.id, { name: p.name });
  send(res, await view(upd), "New dashboard link made. The old link no longer works.");
}));
marketplaceRouter.delete("/:id/link", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const upd = await prisma.marketplacePartner.update({ where: { id: p.id }, data: { tokenActive: false } });
  await audit(req, "link-off", "marketplace_partner", p.id, { name: p.name });
  send(res, await view(upd), "Dashboard link switched off");
}));

// offers: the discount codes and what each costs in loyalty points
marketplaceRouter.post("/:id/offers", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const b = parse(offerBody, req.body);
  if (await prisma.marketplaceOffer.findUnique({ where: { partnerId_code: { partnerId: p.id, code: b.code } } })) throw new AppError(409, "This partner already has an offer with that code");
  await prisma.marketplaceOffer.create({ data: { partnerId: p.id, title: b.title, code: b.code, discountText: b.discountText, pointsCost: b.pointsCost, maxPerCustomer: b.maxPerCustomer, active: b.active } });
  await audit(req, "offer-add", "marketplace_partner", p.id, { code: b.code, pointsCost: b.pointsCost });
  send(res, await view(p), "Offer added", 201);
}));
marketplaceRouter.patch("/:id/offers/:oid", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const o = await prisma.marketplaceOffer.findFirst({ where: { id: param(req, "oid"), partnerId: p.id } });
  if (!o) throw new AppError(404, "Offer not found");
  const b = parse(offerBody.partial(), req.body);
  if (b.code && b.code !== o.code && (await prisma.marketplaceOffer.findUnique({ where: { partnerId_code: { partnerId: p.id, code: b.code } } }))) throw new AppError(409, "This partner already has an offer with that code");
  // a discount the partner wrote starts with no points; once staff set the points it goes live
  if (b.pointsCost !== undefined && num(o.pointsCost) === 0 && b.active === undefined) b.active = true;
  await prisma.marketplaceOffer.update({ where: { id: o.id }, data: { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.code !== undefined ? { code: b.code } : {}), ...(b.discountText !== undefined ? { discountText: b.discountText } : {}), ...(b.pointsCost !== undefined ? { pointsCost: b.pointsCost } : {}), ...(b.maxPerCustomer !== undefined ? { maxPerCustomer: b.maxPerCustomer } : {}), ...(b.active !== undefined ? { active: b.active } : {}) } });
  await audit(req, "offer-edit", "marketplace_partner", p.id, { code: b.code ?? o.code, pointsCost: b.pointsCost ?? num(o.pointsCost), active: b.active ?? o.active });
  send(res, await view(p), "Offer saved");
}));
marketplaceRouter.delete("/:id/offers/:oid", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const o = await prisma.marketplaceOffer.findFirst({ where: { id: param(req, "oid"), partnerId: p.id } });
  if (!o) throw new AppError(404, "Offer not found");
  if ((await prisma.marketplaceRedemption.count({ where: { offerId: o.id } })) > 0) {
    await prisma.marketplaceOffer.update({ where: { id: o.id }, data: { active: false } }); // customers already used it: keep it for the history, just stop it
    await audit(req, "offer-off", "marketplace_partner", p.id, { code: o.code });
    return send(res, await view(p), "Customers have used this offer, so it was switched off instead of deleted");
  }
  await prisma.marketplaceOffer.delete({ where: { id: o.id } });
  await audit(req, "offer-delete", "marketplace_partner", p.id, { code: o.code });
  send(res, await view(p), "Offer deleted");
}));

// the customers who redeemed points at this partner
const redView = (r: Prisma.MarketplaceRedemptionGetPayload<{ include: { offer: true } }>, full: boolean) => ({
  id: r.id, code: r.code, customerName: r.customerName, phone: full ? r.userId : mask(r.userId), offerTitle: r.offer.title, discountText: r.offer.discountText, discountCode: r.offer.code,
  points: num(r.points), status: r.status, createdAt: r.createdAt, usedAt: r.usedAt,
});
marketplaceRouter.get("/:id/redemptions", requirePermission("marketplace.view"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  const rows = await prisma.marketplaceRedemption.findMany({ where: { partnerId: p.id }, include: { offer: true }, orderBy: { createdAt: "desc" }, take: 300 });
  send(res, rows.map((r) => redView(r, true)));
}));

// cancel a card: the customer's points go back (each part with the expiry it had)
marketplaceRouter.post("/redemptions/:rid/cancel", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const rid = param(req, "rid");
  const r = await prisma.marketplaceRedemption.findUnique({ where: { id: rid }, include: { offer: true, partner: true } });
  if (!r) throw new AppError(404, "Card not found");
  if (r.status !== "active") throw new AppError(409, `This card is already ${r.status}`);
  const today = todayKey();
  const parts: { expiresOn: string | null; points: number }[] = r.spent ? JSON.parse(r.spent) : [{ expiresOn: null, points: num(r.points) }];
  await prisma.$transaction(async (tx) => {
    const done = await tx.marketplaceRedemption.updateMany({ where: { id: r.id, status: "active" }, data: { status: "cancelled" } });
    if (done.count !== 1) throw new AppError(409, "This card was just changed. Open it again.");
    for (const [i, part] of parts.entries()) {
      await tx.loyaltyEntry.create({ data: { userId: r.userId, kind: "free_game", points: new Prisma.Decimal(Number(part.points).toFixed(1)), earnedOn: today, expiresOn: part.expiresOn, sourceType: "partner_void", sourceId: `${r.id}:${i}`, detail: `${r.partner.name}: card cancelled, points returned` } });
    }
  });
  await audit(req, "redemption-cancel", "marketplace_partner", r.partnerId, { code: r.code, points: num(r.points), customer: r.userId });
  send(res, null, "Card cancelled and the points returned to the customer");
}));

marketplaceRouter.delete("/:id", requirePermission("marketplace.manage"), handler(async (req, res) => {
  const p = await find(param(req, "id"));
  if ((await prisma.marketplaceRedemption.count({ where: { partnerId: p.id } })) > 0) throw new AppError(409, "Customers have already used this partner. Pause it instead of deleting it.");
  await prisma.$transaction([prisma.marketplacePartner.delete({ where: { id: p.id } }), ...(p.bannerMediaId ? [prisma.contentMedia.deleteMany({ where: { id: p.bannerMediaId } })] : [])]);
  await audit(req, "delete", "marketplace_partner", p.id, { name: p.name });
  send(res, null, "Partner deleted");
}));

/* ====================== the partner's own dashboard (secret link, no staff sign-in) ====================== */
partnerDashboardRouter.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Wait a moment." } }));
partnerDashboardRouter.use(express.json({ limit: "9mb" }));

async function partnerOr404(req: Request) {
  const p = await prisma.marketplacePartner.findUnique({ where: { token: param(req, "token") } });
  if (!p || !p.tokenActive) throw new AppError(404, "This link is not valid. Ask Unique Futsal for a new one.");
  if (!p.lastSeenAt || Date.now() - p.lastSeenAt.getTime() > 60_000) await prisma.marketplacePartner.update({ where: { id: p.id }, data: { lastSeenAt: new Date() } });
  return p;
}
async function dash(p: PartnerRow) {
  const [offers, rows] = await Promise.all([
    prisma.marketplaceOffer.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "asc" } }),
    prisma.marketplaceRedemption.findMany({ where: { partnerId: p.id }, include: { offer: true }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  return {
    partner: { name: p.name, category: p.category, about: p.about, agreementStart: p.agreementStart, agreementEnd: p.agreementEnd, status: statusOf(p), bannerUrl: p.bannerMediaId ? mediaPath(p.bannerMediaId) : null },
    offers: offers.map(offerView),
    stats: { total: rows.length, active: rows.filter((r) => r.status === "active").length, used: rows.filter((r) => r.status === "used").length },
    redemptions: rows.map((r) => redView(r, false)),
  };
}

partnerDashboardRouter.get("/:token", handler(async (req, res) => send(res, await dash(await partnerOr404(req)))));

// check a card code a customer shows; nothing changes
partnerDashboardRouter.post("/:token/verify", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const { code } = parse(z.object({ code: z.string().trim().toUpperCase().min(3).max(30) }), req.body);
  const r = await prisma.marketplaceRedemption.findFirst({ where: { code, partnerId: p.id }, include: { offer: true } });
  if (!r) throw new AppError(404, "No card with this code for your business.");
  send(res, redView(r, false));
}));

// the customer got the discount: mark the card used
partnerDashboardRouter.post("/:token/redemptions/:rid/used", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const done = await prisma.marketplaceRedemption.updateMany({ where: { id: param(req, "rid"), partnerId: p.id, status: "active" }, data: { status: "used", usedAt: new Date() } });
  if (done.count !== 1) throw new AppError(409, "This card is already used or was cancelled.");
  send(res, await dash(p), "Marked as used");
}));

// the partner writes its own discounts (what the customer gets, on which items); only staff set the loyalty points each one costs.
// A new discount waits (off, 0 points) until staff set its points, then it goes live.
const partnerOffer = z.object({
  title: z.string().trim().min(2, "Name the item or offer, for example Momo set").max(60),
  discountText: z.string().trim().min(2, "Say what the customer gets, for example 10% off").max(80),
  maxPerCustomer: z.number().int().min(1).max(100).nullish().transform((v) => v ?? null),
});
const newCode = () => `D${randomBytes(4).toString("hex").slice(0, 5).toUpperCase()}`;
partnerDashboardRouter.post("/:token/offers", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const b = parse(partnerOffer, req.body);
  if ((await prisma.marketplaceOffer.count({ where: { partnerId: p.id } })) >= 30) throw new AppError(409, "You have 30 discounts already. Remove one first.");
  await prisma.marketplaceOffer.create({ data: { partnerId: p.id, title: b.title, code: newCode(), discountText: b.discountText, pointsCost: 0, maxPerCustomer: b.maxPerCustomer, active: false } });
  await audit(req, "offer-add", "marketplace_partner", p.id, { by: "partner", title: b.title });
  send(res, await dash(p), "Added. Unique Futsal will set its loyalty points, then customers can use it.", 201);
}));
partnerDashboardRouter.patch("/:token/offers/:oid", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const o = await prisma.marketplaceOffer.findFirst({ where: { id: param(req, "oid"), partnerId: p.id } });
  if (!o) throw new AppError(404, "Discount not found");
  const b = parse(partnerOffer.partial().extend({ active: z.boolean().optional() }), req.body);
  if (b.active && num(o.pointsCost) <= 0) throw new AppError(409, "Unique Futsal has not set the loyalty points for this discount yet.");
  await prisma.marketplaceOffer.update({ where: { id: o.id }, data: { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.discountText !== undefined ? { discountText: b.discountText } : {}), ...(b.maxPerCustomer !== undefined ? { maxPerCustomer: b.maxPerCustomer } : {}), ...(b.active !== undefined ? { active: b.active } : {}) } });
  await audit(req, "offer-edit", "marketplace_partner", p.id, { by: "partner", code: o.code });
  send(res, await dash(p), "Saved");
}));
partnerDashboardRouter.delete("/:token/offers/:oid", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const o = await prisma.marketplaceOffer.findFirst({ where: { id: param(req, "oid"), partnerId: p.id } });
  if (!o) throw new AppError(404, "Discount not found");
  if ((await prisma.marketplaceRedemption.count({ where: { offerId: o.id } })) > 0) {
    await prisma.marketplaceOffer.update({ where: { id: o.id }, data: { active: false } });
    return send(res, await dash(p), "Customers have used this discount, so it was switched off instead of removed");
  }
  await prisma.marketplaceOffer.delete({ where: { id: o.id } });
  await audit(req, "offer-delete", "marketplace_partner", p.id, { by: "partner", code: o.code });
  send(res, await dash(p), "Removed");
}));

// the partner changes its own banner (shown in the customer app); staff can replace or remove it any time
partnerDashboardRouter.post("/:token/banner", handler(async (req, res) => {
  const p = await partnerOr404(req);
  const { image } = parse(z.object({ image: z.string().min(20) }), req.body);
  const media = (await saveMedia(image, `partner:${p.id}`)).media;
  await prisma.marketplacePartner.update({ where: { id: p.id }, data: { bannerMediaId: media.id } });
  if (p.bannerMediaId) await prisma.contentMedia.deleteMany({ where: { id: p.bannerMediaId } });
  send(res, await dash({ ...p, bannerMediaId: media.id }), "Banner updated");
}));
