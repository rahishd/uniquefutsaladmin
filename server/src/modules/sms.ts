// The SMS page: the texts the customer backend has sent (SmsLog, written by the customer backend), and the wording of the customer's texts.
// The wording is saved in Settings under "smsTemplates" (JSON { key: text }); the customer backend reads it for every text it sends and uses its
// own default for a key with no saved text. KEYS and DEFAULTS below are a copy of the customer backend's services/smsTemplates.ts: change both together.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getJson, setSetting } from "./settings-store";

export const smsRouter = Router();

type Placeholder = { name: string; meaning: string; sample: string };
type Template = { key: string; label: string; when: string; placeholders: Placeholder[]; defaultBody: string };

const BOOKING: Placeholder[] = [
  { name: "name", meaning: "the customer's name", sample: "Sita" },
  { name: "date", meaning: "the game day, like Sat, 15 Nov", sample: "Sat, 15 Nov" },
  { name: "time", meaning: "the start time", sample: "18:00" },
  { name: "code", meaning: "the booking code", sample: "UF-7K2M9Q" },
];
const DUE: Placeholder = { name: "due", meaning: "\"Please pay Rs. N at the venue.\" when something is left to pay, otherwise empty", sample: " Please pay Rs. 500 at the venue." };

export const TEMPLATES: Template[] = [
  {
    key: "booking_requested", label: "Booking requested", when: "Sent when a customer books and chooses to pay at the venue: the booking waits for the venue.",
    placeholders: BOOKING,
    defaultBody: "Dear {name}, we received your booking request for {time} on {date}. It is awaiting confirmation from Unique Futsal; we will text you once it is confirmed. Code {code}.",
  },
  {
    key: "booking_confirmed", label: "Booking confirmation", when: "Sent when a booking is confirmed: paid online, free game, or confirmed by staff.",
    placeholders: [...BOOKING, DUE],
    defaultBody: "Dear {name}, your booking is confirmed for {time} on {date}.{due} Please arrive 10 minutes early. Code {code}. - Unique Futsal",
  },
  {
    key: "booking_cancelled", label: "Cancelled booking", when: "Sent when a booking is cancelled, by the customer or by staff.",
    placeholders: BOOKING.filter((p) => p.name !== "code"),
    defaultBody: "Dear {name}, your booking scheduled for {time} on {date} has been cancelled. If this was unintentional, please contact us or rebook your slot anytime. Thank you for choosing Unique Futsal.",
  },
  {
    key: "otp", label: "OTP message", when: "Sent with the 6-digit code when someone signs in with a code or verifies a new mobile number. The code is never stored in the log.",
    placeholders: [{ name: "otp", meaning: "the 6-digit code (required)", sample: "482917" }],
    defaultBody: "{otp} is your Unique Futsal code. It works for 10 minutes. Do not share it with anyone.",
  },
  {
    key: "login_details", label: "Login details (new customers)", when: "Sent from the New customers tab, when staff share a new customer's sign-in details. A password is never sent: the customer signs in with a code.",
    placeholders: [
      { name: "name", meaning: "the customer's first name", sample: "Sita" },
      { name: "phone", meaning: "the customer's mobile number", sample: "9801234567" },
      { name: "link", meaning: "the address of the customer app", sample: "www.uniquefutsal.com" },
    ],
    defaultBody: "Welcome to Unique Futsal, {name}! Your account is ready. Sign in at {link} with your mobile number {phone}: use your password, or tap Continue with OTP to get a code by SMS.",
  },
  {
    key: "reminder", label: "Game reminder", when: "Sent one hour before a game.",
    placeholders: [BOOKING[0], BOOKING[1], BOOKING[2]],
    defaultBody: "Reminder: your game starts in 1 hour (@{time}). See you at Unique Futsal!",
  },
];

const KIND_LABELS: Record<string, string> = {
  booking_requested: "Booking requested", booking_confirmed: "Booking confirmation", booking_cancelled: "Cancelled booking", otp: "OTP",
  reminder: "Game reminder", staff_alert: "Venue alert", membership: "Membership", mass: "Mass message", login_details: "Login details", test: "Test text", other: "Other",
};
const STATUSES = ["queued", "failed"] as const;
const MAX_LEN = 320;

/** The wording of a message with its placeholders filled in: the saved text, or the standard one. */
export async function renderTemplate(key: string, vars: Record<string, string>): Promise<string> {
  const t = find(key);
  const saved = (await getJson<Record<string, string>>("smsTemplates", {}))[key];
  const body = typeof saved === "string" && saved.trim() ? saved.trim() : t.defaultBody;
  return body.replace(/\{(\w+)\}/g, (whole, n: string) => (n in vars ? vars[n] : whole)).replace(/ {2,}/g, " ").trim();
}

const find = (key: string) => {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new AppError(404, "Unknown message");
  return t;
};
const fill = (body: string, t: Template) => body.replace(/\{(\w+)\}/g, (whole, n: string) => t.placeholders.find((p) => p.name === n)?.sample ?? whole);
const nepalDayStart = (d: string) => new Date(`${d}T00:00:00+05:45`);
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---- sent messages -------------------------------------------------------------------------------------------------

smsRouter.get("/logs", requirePermission("sms.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const text = q.q?.trim().slice(0, 60);
  const kind = q.kind && KIND_LABELS[q.kind] ? q.kind : undefined;
  const status = q.status && (STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;
  const from = q.from && dayStr.safeParse(q.from).success ? nepalDayStart(q.from) : undefined;
  const to = q.to && dayStr.safeParse(q.to).success ? new Date(nepalDayStart(q.to).getTime() + 24 * 60 * 60 * 1000) : undefined;
  const where: Prisma.SmsLogWhereInput = {
    ...(kind ? { kind } : {}), ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(text ? { OR: [
      { phoneNumber: { contains: text } },
      { recipientName: { contains: text, mode: "insensitive" } },
      { bookingCode: { contains: text, mode: "insensitive" } },
      { message: { contains: text, mode: "insensitive" } },
    ] } : {}),
  };
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [rows, total, last24, week, failedWeek] = await Promise.all([
    prisma.smsLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.smsLog.count({ where }),
    prisma.smsLog.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.smsLog.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.smsLog.count({ where: { createdAt: { gte: weekAgo }, status: "failed" } }),
  ]);
  send(res, {
    items: rows.map((r) => ({ ...r, kindLabel: KIND_LABELS[r.kind] ?? r.kind })),
    total, page: pageNo, pages: Math.max(1, Math.ceil(total / limit)),
    stats: { last24, week, failedWeek },
    kinds: Object.entries(KIND_LABELS).map(([key, label]) => ({ key, label })),
  });
}));

// ---- the wording ---------------------------------------------------------------------------------------------------

async function view() {
  const saved = await getJson<Record<string, string>>("smsTemplates", {});
  return TEMPLATES.map((t) => {
    const custom = typeof saved[t.key] === "string" && saved[t.key].trim() ? saved[t.key].trim() : null;
    const body = custom ?? t.defaultBody;
    return { key: t.key, label: t.label, when: t.when, placeholders: t.placeholders, defaultBody: t.defaultBody, body, custom: custom !== null && custom !== t.defaultBody, preview: fill(body, t).replace(/ {2,}/g, " ").trim(), maxLength: MAX_LEN };
  });
}

smsRouter.get("/templates", requirePermission("sms.view"), handler(async (_req, res) => send(res, await view())));

const bodySchema = z.object({ body: z.string().trim().min(5, "Write at least a few words").max(MAX_LEN, `Keep it under ${MAX_LEN} characters`) });

smsRouter.put("/templates/:key", requirePermission("sms.manage"), handler(async (req, res) => {
  const t = find(param(req, "key"));
  const { body } = parse(bodySchema, req.body);
  const allowed = new Set(t.placeholders.map((p) => p.name));
  const unknown = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((n) => !allowed.has(n));
  if (unknown.length) throw new AppError(400, `Not available in this message: ${unknown.map((n) => `{${n}}`).join(", ")}. You can use ${t.placeholders.map((p) => `{${p.name}}`).join(", ")}.`);
  if (/\{[^}]*$|^[^{]*\}/.test(body.replace(/\{\w+\}/g, ""))) throw new AppError(400, "A { or } is left open. Write placeholders like {name}.");
  if (t.key === "otp" && !body.includes("{otp}")) throw new AppError(400, "The OTP message must contain {otp}, or customers would not get their code.");
  const saved = await getJson<Record<string, string>>("smsTemplates", {});
  saved[t.key] = body;
  await setSetting("smsTemplates", JSON.stringify(saved));
  await audit(req, "sms.template.update", "SmsTemplate", t.key, { body });
  send(res, (await view()).find((x) => x.key === t.key), "Saved. New texts use this wording within a minute.");
}));

smsRouter.delete("/templates/:key", requirePermission("sms.manage"), handler(async (req, res) => {
  const t = find(param(req, "key"));
  const saved = await getJson<Record<string, string>>("smsTemplates", {});
  delete saved[t.key];
  await setSetting("smsTemplates", JSON.stringify(saved));
  await audit(req, "sms.template.reset", "SmsTemplate", t.key);
  send(res, (await view()).find((x) => x.key === t.key), "Back to the standard wording.");
}));
