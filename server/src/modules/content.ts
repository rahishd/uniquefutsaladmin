// Site Content, staff side: gallery photos and ads shown in the customer app (customer backend GET /content/active).
// Pictures are checked by really decoding them, stripped of location data, shrunk to 1600px JPEG and stored in the database.
import express, { Router } from "express";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { nowMinutes, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { birthdaysRouter, birthdaysToWish } from "./birthdays";

export const contentRouter = Router();
// pictures arrive as data URLs, so this router (only reachable after sign-in) accepts bigger bodies than the rest of the API
contentRouter.use(express.json({ limit: "14mb" }));

export const PLACEMENTS = ["header", "footer", "popup", "inline"] as const;
const MAX_ITEMS = 100;
const MAX_BYTES = 8 * 1024 * 1024;
const DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

async function processImage(dataUrl: string) {
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) throw new AppError(400, "The picture must be a JPG, PNG or WebP image.");
  const raw = Buffer.from(m[1], "base64");
  if (raw.length === 0 || raw.length > MAX_BYTES) throw new AppError(400, "The picture is too large. The limit is 8 MB.");
  try {
    // rotate() applies the camera orientation; location data is dropped because metadata is not kept
    const { data, info } = await sharp(raw, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError(400, "That picture could not be read. Please choose a different image.");
  }
}

const orientationOf = (w: number, h: number) => (w / h > 1.15 ? "landscape" : w / h < 0.87 ? "portrait" : "square");
const saveMedia = async (dataUrl: string, staffId: string) => {
  const p = await processImage(dataUrl);
  return { media: await prisma.contentMedia.create({ data: { mime: "image/jpeg", data: p.data, width: p.width, height: p.height, bytes: p.data.length, createdBy: staffId } }), ...p };
};
const mediaPath = (id: string) => `/api/content/media/${id}`;

// ---- when is an ad live? Same rule as the customer backend (src/modules/content/content.service.ts) ----
type Sched = { active: boolean; startDate: string | null; endDate: string | null; dailyStart: string | null; dailyEnd: string | null; days: number[] };
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const clock = (now: Date) => { const m = nowMinutes(now); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

export function isLive(a: Sched, now: Date = new Date()): boolean {
  if (!a.active) return false;
  const today = todayKey(now);
  if (a.startDate && today < a.startDate) return false;
  if (a.endDate && today > a.endDate) return false;
  if (a.days.length > 0 && !a.days.includes(weekday(today))) return false;
  if (a.dailyStart && a.dailyEnd) {
    const t = clock(now);
    const inside = a.dailyStart <= a.dailyEnd ? t >= a.dailyStart && t < a.dailyEnd : t >= a.dailyStart || t < a.dailyEnd;
    if (!inside) return false;
  }
  return true;
}

// What staff see on the card
export function adStatus(a: Sched, now: Date = new Date()): "live" | "paused" | "scheduled" | "ended" | "waiting" {
  if (!a.active) return "paused";
  const today = todayKey(now);
  if (a.endDate && today > a.endDate) return "ended";
  if (a.startDate && today < a.startDate) return "scheduled";
  return isLive(a, now) ? "live" : "waiting"; // inside its dates, but not in today's hours or on today's weekday
}

type AdRow = Prisma.SiteAdGetPayload<object>;
const adView = (a: AdRow) => ({
  id: a.id, title: a.title, imageUrl: mediaPath(a.mediaId), linkUrl: a.linkUrl, placement: a.placement, displaySeconds: a.displaySeconds,
  popupDelaySeconds: a.popupDelaySeconds, popupFrequency: a.popupFrequency, startDate: a.startDate, endDate: a.endDate, dailyStart: a.dailyStart, dailyEnd: a.dailyEnd,
  days: a.days, priority: a.priority, active: a.active, impressions: a.impressions, clicks: a.clicks, status: adStatus(a), createdAt: a.createdAt,
});

// ---------- birthdays today: wish and gift ----------
contentRouter.use("/birthdays", birthdaysRouter);

// ---------- overview ----------
contentRouter.get("/overview", requirePermission("content.view"), handler(async (_req, res) => {
  const [photos, hidden, ads] = await Promise.all([prisma.siteGallery.count(), prisma.siteGallery.count({ where: { visible: false } }), prisma.siteAd.findMany()]);
  const live = ads.filter((a) => isLive(a));
  send(res, {
    photos, hiddenPhotos: hidden, ads: ads.length, liveAds: live.length, liveByPlace: Object.fromEntries(PLACEMENTS.map((p) => [p, live.filter((a) => a.placement === p).length])),
    impressions: ads.reduce((s, a) => s + a.impressions, 0), clicks: ads.reduce((s, a) => s + a.clicks, 0), birthdays: await birthdaysToWish(),
  });
}));

// ---------- gallery ----------
const galleryView = (g: Prisma.SiteGalleryGetPayload<object>) => ({ id: g.id, title: g.title, caption: g.caption, orientation: g.orientation, visible: g.visible, sortOrder: g.sortOrder, imageUrl: mediaPath(g.mediaId), createdAt: g.createdAt });

contentRouter.get("/gallery", requirePermission("content.view"), handler(async (_req, res) => {
  send(res, (await prisma.siteGallery.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] })).map(galleryView));
}));

contentRouter.post("/gallery", requirePermission("content.gallery"), handler(async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(1, "Give the photo a title").max(80), caption: z.string().trim().max(200).optional(), image: z.string().min(50, "Choose a picture") }), req.body);
  if ((await prisma.siteGallery.count()) >= MAX_ITEMS) throw new AppError(409, `The gallery is full (${MAX_ITEMS} photos). Delete one first.`);
  const { media, width, height } = await saveMedia(b.image, req.staff!.id);
  const first = await prisma.siteGallery.aggregate({ _min: { sortOrder: true } });
  const item = await prisma.siteGallery.create({ data: { title: b.title, caption: b.caption || null, mediaId: media.id, orientation: orientationOf(width, height), sortOrder: (first._min.sortOrder ?? 0) - 1, createdBy: req.staff!.id } });
  await audit(req, "create", "gallery", item.id, { title: b.title, orientation: item.orientation });
  send(res, galleryView(item), "Photo added", 201);
}));

contentRouter.patch("/gallery/:id", requirePermission("content.gallery"), handler(async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(1).max(80).optional(), caption: z.string().trim().max(200).nullable().optional(), visible: z.boolean().optional() }), req.body);
  const g = await prisma.siteGallery.findUnique({ where: { id: param(req, "id") } });
  if (!g) throw new AppError(404, "Photo not found");
  const upd = await prisma.siteGallery.update({ where: { id: g.id }, data: { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.caption !== undefined ? { caption: b.caption || null } : {}), ...(b.visible !== undefined ? { visible: b.visible } : {}) } });
  await audit(req, "update", "gallery", g.id, b);
  send(res, galleryView(upd), "Saved");
}));

contentRouter.post("/gallery/reorder", requirePermission("content.gallery"), handler(async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string()).min(1).max(MAX_ITEMS) }), req.body);
  const known = new Set((await prisma.siteGallery.findMany({ select: { id: true } })).map((g) => g.id));
  if (b.ids.some((id) => !known.has(id)) || new Set(b.ids).size !== b.ids.length) throw new AppError(400, "That list does not match the gallery");
  await prisma.$transaction(b.ids.map((id, i) => prisma.siteGallery.update({ where: { id }, data: { sortOrder: i } })));
  await audit(req, "reorder", "gallery", null, { count: b.ids.length });
  send(res, null, "Order saved");
}));

contentRouter.delete("/gallery/:id", requirePermission("content.gallery"), handler(async (req, res) => {
  const g = await prisma.siteGallery.findUnique({ where: { id: param(req, "id") } });
  if (!g) throw new AppError(404, "Photo not found");
  await prisma.$transaction([prisma.siteGallery.delete({ where: { id: g.id } }), prisma.contentMedia.deleteMany({ where: { id: g.mediaId } })]);
  await audit(req, "delete", "gallery", g.id, { title: g.title });
  send(res, null, "Photo deleted");
}));

// ---------- corporate network (partner logos) ----------
const MAX_PARTNERS = 60;
// A logo keeps its transparency and is stored as a small WebP, at most 600 x 360 px.
async function processLogo(dataUrl: string) {
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) throw new AppError(400, "The logo must be a JPG, PNG or WebP image.");
  const raw = Buffer.from(m[1], "base64");
  if (raw.length === 0 || raw.length > MAX_BYTES) throw new AppError(400, "The logo is too large. The limit is 8 MB.");
  try {
    const { data, info } = await sharp(raw, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: 600, height: 360, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError(400, "That logo could not be read. Please choose a different image.");
  }
}
const saveLogo = async (dataUrl: string, staffId: string) => {
  const p = await processLogo(dataUrl);
  return prisma.contentMedia.create({ data: { mime: "image/webp", data: p.data, width: p.width, height: p.height, bytes: p.data.length, createdBy: staffId } });
};
const partnerView = (p: Prisma.SitePartnerGetPayload<object>) => ({ id: p.id, name: p.name, visible: p.visible, sortOrder: p.sortOrder, imageUrl: mediaPath(p.mediaId), createdAt: p.createdAt });

contentRouter.get("/partners", requirePermission("content.view"), handler(async (_req, res) => {
  send(res, (await prisma.sitePartner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(partnerView));
}));

contentRouter.post("/partners", requirePermission("content.partners"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1, "Write the name").max(60), image: z.string().min(50, "Choose a logo") }), req.body);
  if ((await prisma.sitePartner.count()) >= MAX_PARTNERS) throw new AppError(409, `The list is full (${MAX_PARTNERS} logos). Delete one first.`);
  const media = await saveLogo(b.image, req.staff!.id);
  const last = await prisma.sitePartner.aggregate({ _max: { sortOrder: true } });
  const item = await prisma.sitePartner.create({ data: { name: b.name, mediaId: media.id, sortOrder: (last._max.sortOrder ?? -1) + 1, createdBy: req.staff!.id } });
  await audit(req, "create", "partner", item.id, { name: b.name });
  send(res, partnerView(item), "Logo added", 201);
}));

contentRouter.patch("/partners/:id", requirePermission("content.partners"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), visible: z.boolean().optional(), image: z.string().min(50).optional() }), req.body);
  const p = await prisma.sitePartner.findUnique({ where: { id: param(req, "id") } });
  if (!p) throw new AppError(404, "Logo not found");
  let mediaId = p.mediaId;
  let oldMedia: string | null = null;
  if (b.image) {
    // a replacement gets a new id, so browsers never show the old picture from cache
    mediaId = (await saveLogo(b.image, req.staff!.id)).id;
    oldMedia = p.mediaId;
  }
  const upd = await prisma.sitePartner.update({ where: { id: p.id }, data: { ...(b.name !== undefined ? { name: b.name } : {}), ...(b.visible !== undefined ? { visible: b.visible } : {}), mediaId } });
  if (oldMedia) await prisma.contentMedia.deleteMany({ where: { id: oldMedia } });
  await audit(req, "update", "partner", p.id, { ...(b.name !== undefined ? { name: b.name } : {}), ...(b.visible !== undefined ? { visible: b.visible } : {}), ...(b.image ? { picture: "replaced" } : {}) });
  send(res, partnerView(upd), "Saved");
}));

contentRouter.post("/partners/reorder", requirePermission("content.partners"), handler(async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string()).min(1).max(MAX_PARTNERS) }), req.body);
  const known = new Set((await prisma.sitePartner.findMany({ select: { id: true } })).map((x) => x.id));
  if (b.ids.some((id) => !known.has(id)) || new Set(b.ids).size !== b.ids.length) throw new AppError(400, "That list does not match the logos");
  await prisma.$transaction(b.ids.map((id, i) => prisma.sitePartner.update({ where: { id }, data: { sortOrder: i } })));
  await audit(req, "reorder", "partner", null, { count: b.ids.length });
  send(res, null, "Order saved");
}));

contentRouter.delete("/partners/:id", requirePermission("content.partners"), handler(async (req, res) => {
  const p = await prisma.sitePartner.findUnique({ where: { id: param(req, "id") } });
  if (!p) throw new AppError(404, "Logo not found");
  await prisma.$transaction([prisma.sitePartner.delete({ where: { id: p.id } }), prisma.contentMedia.deleteMany({ where: { id: p.mediaId } })]);
  await audit(req, "delete", "partner", p.id, { name: p.name });
  send(res, null, "Logo deleted");
}));

// ---------- ads ----------
const link = z.string().trim().max(300).refine((v) => v === "" || /^\/[A-Za-z0-9\-._~/?=&%#]*$/.test(v) || /^https:\/\/[^\s]+$/i.test(v), "Use a page of the app such as /book, or an address starting with https://");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm");

const adFields = {
  title: z.string().trim().min(2, "Give the ad a name").max(80),
  linkUrl: link.optional().nullable(),
  placement: z.enum(PLACEMENTS),
  displaySeconds: z.number().int().min(0).max(60),
  popupDelaySeconds: z.number().int().min(0).max(60),
  popupFrequency: z.enum(["session", "day", "always"]),
  startDate: dateStr.nullable().optional(),
  endDate: dateStr.nullable().optional(),
  dailyStart: hhmm.nullable().optional(),
  dailyEnd: hhmm.nullable().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  priority: z.number().int().min(0).max(100),
  active: z.boolean(),
};

function checkRules(a: { placement: string; displaySeconds: number; startDate?: string | null; endDate?: string | null; dailyStart?: string | null; dailyEnd?: string | null }) {
  if (a.placement !== "popup" && a.displaySeconds < 3) throw new AppError(400, "Each ad must show for at least 3 seconds");
  if (!!a.dailyStart !== !!a.dailyEnd) throw new AppError(400, "Choose both the start and the end time, or neither (all day)");
  if (a.dailyStart && a.dailyStart === a.dailyEnd) throw new AppError(400, "The start and end time must be different");
  if (a.startDate && a.endDate && a.endDate < a.startDate) throw new AppError(400, "The end date is before the start date");
}

contentRouter.get("/ads", requirePermission("content.view"), handler(async (_req, res) => {
  const rows = await prisma.siteAd.findMany({ orderBy: [{ createdAt: "desc" }] });
  send(res, rows.map(adView));
}));

contentRouter.post("/ads", requirePermission("content.ads"), handler(async (req, res) => {
  const b = parse(z.object({ ...adFields, image: z.string().min(50, "Choose a picture") }).partial({ displaySeconds: true, popupDelaySeconds: true, popupFrequency: true, days: true, priority: true, active: true }), req.body);
  const data = { displaySeconds: 6, popupDelaySeconds: 3, popupFrequency: "day" as const, days: [] as number[], priority: 0, active: true, ...b };
  checkRules(data);
  if ((await prisma.siteAd.count()) >= MAX_ITEMS) throw new AppError(409, `There are already ${MAX_ITEMS} ads. Delete old ones first.`);
  const { media } = await saveMedia(b.image, req.staff!.id);
  const ad = await prisma.siteAd.create({
    data: {
      title: data.title, mediaId: media.id, linkUrl: data.linkUrl || null, placement: data.placement, displaySeconds: data.displaySeconds, popupDelaySeconds: data.popupDelaySeconds,
      popupFrequency: data.popupFrequency, startDate: data.startDate || null, endDate: data.endDate || null, dailyStart: data.dailyStart || null, dailyEnd: data.dailyEnd || null,
      days: [...new Set(data.days)].sort(), priority: data.priority, active: data.active, createdBy: req.staff!.id,
    },
  });
  await audit(req, "create", "ad", ad.id, { title: ad.title, placement: ad.placement, window: ad.dailyStart ? `${ad.dailyStart}-${ad.dailyEnd}` : "all day" });
  send(res, adView(ad), "Ad added", 201);
}));

contentRouter.patch("/ads/:id", requirePermission("content.ads"), handler(async (req, res) => {
  const b = parse(z.object({ ...adFields, image: z.string().min(50) }).partial(), req.body);
  const a = await prisma.siteAd.findUnique({ where: { id: param(req, "id") } });
  if (!a) throw new AppError(404, "Ad not found");
  const next = { placement: b.placement ?? a.placement, displaySeconds: b.displaySeconds ?? a.displaySeconds, startDate: b.startDate === undefined ? a.startDate : b.startDate, endDate: b.endDate === undefined ? a.endDate : b.endDate, dailyStart: b.dailyStart === undefined ? a.dailyStart : b.dailyStart, dailyEnd: b.dailyEnd === undefined ? a.dailyEnd : b.dailyEnd };
  checkRules(next);
  const newMedia = b.image ? (await saveMedia(b.image, req.staff!.id)).media : null;
  const upd = await prisma.siteAd.update({
    where: { id: a.id },
    data: {
      ...(b.title !== undefined ? { title: b.title } : {}), ...(b.linkUrl !== undefined ? { linkUrl: b.linkUrl || null } : {}), ...(b.placement !== undefined ? { placement: b.placement } : {}),
      ...(b.displaySeconds !== undefined ? { displaySeconds: b.displaySeconds } : {}), ...(b.popupDelaySeconds !== undefined ? { popupDelaySeconds: b.popupDelaySeconds } : {}),
      ...(b.popupFrequency !== undefined ? { popupFrequency: b.popupFrequency } : {}), startDate: next.startDate || null, endDate: next.endDate || null, dailyStart: next.dailyStart || null, dailyEnd: next.dailyEnd || null,
      ...(b.days !== undefined ? { days: [...new Set(b.days)].sort() } : {}), ...(b.priority !== undefined ? { priority: b.priority } : {}), ...(b.active !== undefined ? { active: b.active } : {}),
      ...(newMedia ? { mediaId: newMedia.id } : {}),
    },
  });
  if (newMedia) await prisma.contentMedia.deleteMany({ where: { id: a.mediaId } }); // the old picture is no longer used
  await audit(req, "update", "ad", a.id, { ...b, image: b.image ? "replaced" : undefined });
  send(res, adView(upd), "Saved");
}));

contentRouter.delete("/ads/:id", requirePermission("content.ads"), handler(async (req, res) => {
  const a = await prisma.siteAd.findUnique({ where: { id: param(req, "id") } });
  if (!a) throw new AppError(404, "Ad not found");
  await prisma.$transaction([prisma.siteAd.delete({ where: { id: a.id } }), prisma.contentMedia.deleteMany({ where: { id: a.mediaId } })]);
  await audit(req, "delete", "ad", a.id, { title: a.title });
  send(res, null, "Ad deleted");
}));
