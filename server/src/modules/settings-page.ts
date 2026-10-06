// Settings page: venue details, Wi-Fi, the booking deposit, and a read-only look at the integrations.
// These use the same Settings keys the customer backend already reads (siteInfo, wifiSSID, wifiPassword, advanceDeposit),
// so a change here shows in the customer app without any change over there. Secrets (keys, passwords of services) are never returned.
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getSetting, setSetting } from "./settings-store";

export const settingsPageRouter = Router();

// Same defaults as the customer backend (modules/site/site.routes.ts)
const VENUE_DEFAULTS = {
  name: "Unique Futsal", phone: "9811940018", whatsapp: "https://wa.me/9779811940018", email: "info.uniquefutsal@gmail.com",
  address: "Manigram Tilottama-05, Rupandehi, Nepal", facebook: "", tiktok: "",
  mapEmbed: "https://www.google.com/maps?q=Unique+Futsal+Tilottama+Rupandehi+Nepal&output=embed",
};
type Venue = typeof VENUE_DEFAULTS;

async function loadVenue(): Promise<Venue> {
  let saved: Partial<Venue> = {};
  try { const v = await getSetting("siteInfo"); saved = v ? JSON.parse(v) : {}; } catch { saved = {}; }
  return { ...VENUE_DEFAULTS, ...saved };
}

const url = (what: string) => z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), `${what} must start with https://`);
const venueBody = z.object({
  name: z.string().trim().min(2, "Enter the venue name").max(80),
  phone: z.string().trim().regex(/^\+?\d[\d\s-]{6,16}$/, "Enter a phone number with digits only"),
  whatsapp: url("The WhatsApp link").refine((v) => v === "" || /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(v), "Use a WhatsApp link like https://wa.me/9779811940018"),
  email: z.string().trim().max(120).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  address: z.string().trim().min(3, "Enter the address").max(200),
  facebook: url("The Facebook link"),
  tiktok: url("The TikTok link"),
  mapEmbed: url("The map link"),
});

const wifiBody = z.object({ ssid: z.string().trim().max(32, "At most 32 characters"), password: z.string().max(63, "At most 63 characters") })
  .refine((b) => b.ssid !== "" || b.password === "", { message: "Enter the Wi-Fi name too", path: ["ssid"] });
const bookingBody = z.object({ advanceDeposit: z.number().int("Whole rupees only").min(0).max(100_000) });

settingsPageRouter.get("/", requirePermission("settings.view"), handler(async (req, res) => {
  const canEdit = !!req.staff!.permissions?.includes("settings.edit");
  const [venue, ssid, password, deposit, db] = await Promise.all([
    loadVenue(), getSetting("wifiSSID"), getSetting("wifiPassword"), getSetting("advanceDeposit"),
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
  ]);
  send(res, {
    venue,
    wifi: { ssid: ssid ?? "", password: canEdit ? password ?? "" : password ? "(set)" : "" },
    booking: { advanceDeposit: Number(deposit ?? 0) || 0 },
    integrations: {
      fonepay: { mode: env.FONEPAY_MODE, configured: !!(env.FONEPAY_MERCHANT_CODE && env.FONEPAY_SECRET && env.FONEPAY_BASE_URL), note: env.FONEPAY_MODE === "test" ? "Test mode: QR codes are fake and staff use the Simulate button. Real payments need live keys." : "Live" },
      push: { configured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) },
      database: db,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
    },
    server: { time: new Date().toISOString() },
    canEdit,
  });
}));

settingsPageRouter.put("/venue", requirePermission("settings.edit"), handler(async (req, res) => {
  const b = parse(venueBody, req.body);
  const before = await loadVenue();
  await setSetting("siteInfo", JSON.stringify(b));
  await audit(req, "update-venue", "settings", "siteInfo", { changed: (Object.keys(b) as (keyof Venue)[]).filter((k) => b[k] !== before[k]) });
  send(res, b, "Venue details saved");
}));

settingsPageRouter.put("/wifi", requirePermission("settings.edit"), handler(async (req, res) => {
  const b = parse(wifiBody, req.body);
  await setSetting("wifiSSID", b.ssid);
  await setSetting("wifiPassword", b.password);
  await audit(req, "update-wifi", "settings", "wifi", { name: b.ssid, passwordChanged: true }); // the password itself is never written to the log
  send(res, { ssid: b.ssid, password: b.password }, "Wi-Fi saved");
}));

settingsPageRouter.put("/booking", requirePermission("settings.edit"), handler(async (req, res) => {
  const b = parse(bookingBody, req.body);
  const before = Number((await getSetting("advanceDeposit")) ?? 0) || 0;
  await setSetting("advanceDeposit", String(b.advanceDeposit));
  await audit(req, "update-booking-rules", "settings", "advanceDeposit", { from: before, to: b.advanceDeposit });
  send(res, b, "Booking settings saved");
}));
