// SMS page, part 2: mass messages (wishes, offers, notices) to a chosen group of customers, and login details for newly registered customers.
//
// Mass messages:  pick a group (audience) -> write the text -> review the count -> send. The server sends them one after another
// (3 at a time) in the background and keeps count in SmsCampaign; staff can stop a send that is under way. Rules:
//   - only active customers with a real mobile number; people who switched off "Promotional notifications" in the app are left out
//     (a list of numbers typed by staff is sent as typed)
//   - at most MAX_RECIPIENTS in one send; the browser sends the count it was shown and the server refuses if the group changed meanwhile
//   - {name} in the text becomes the customer's first name
// Login details: a text with the customer's mobile number, the app address and how to sign in (password or a code by SMS). A password is never
// sent: it is stored hashed and cannot be read back.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { ageOn } from "../lib/age";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { sendSms, smsConfigured, smsParts } from "../lib/sms-send";
import { requirePermission } from "../middleware/auth";
import { birthdayEndings } from "./birthdays";
import { renderTemplate } from "./sms";

export const smsMassRouter = Router();

export const MAX_RECIPIENTS = 1000;
const MAX_LEN = 320;
const PHONE = /^9\d{9}$/;
const CONCURRENCY = 3;

type Person = { phone: string; name: string };

export const AUDIENCES = [
  { key: "all", label: "All customers", description: "Everyone with an account" },
  { key: "members", label: "Members", description: "Unique Club and membership plan holders" },
  { key: "vip", label: "VIP customers", description: "Customers with an active VIP code" },
  { key: "played30", label: "Played recently", description: "Booked a game in the last 30 days" },
  { key: "lapsed60", label: "Haven't played in a while", description: "No game in the last 60 days: a good time for an offer" },
  { key: "birthday", label: "Birthdays today", description: "Customers whose birthday is today" },
  { key: "new7", label: "New this week", description: "Registered in the last 7 days" },
  { key: "numbers", label: "Specific numbers", description: "Type or paste the mobile numbers yourself" },
] as const;
type AudienceKey = (typeof AUDIENCES)[number]["key"];
const audienceLabel = (k: string) => AUDIENCES.find((a) => a.key === k)?.label ?? k;

const first = (name: string | null, phone: string) => (name ?? "").trim().split(/\s+/)[0] || "Customer";

/** Mobile numbers from free text: any separators, with or without +977, 977 or a leading 0. Returns the good ones and how many were not numbers. */
export function parseNumbers(text: string): { numbers: string[]; invalid: number } {
  const seen = new Set<string>();
  let invalid = 0;
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const d = raw.replace(/\D/g, "").replace(/^(00)?977/, "").replace(/^0+/, "");
    if (PHONE.test(d)) seen.add(d);
    else invalid++;
  }
  return { numbers: [...seen], invalid };
}

type Group = { people: Person[]; optedOut: number; invalid: number };

async function customersByPhone(phones: string[] | null, where: object = {}) {
  return prisma.user.findMany({
    where: { role: "user", isActive: true, ...(phones ? { phoneNumber: { in: phones } } : {}), ...where },
    select: { phoneNumber: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function group(key: AudienceKey, numbersText = ""): Promise<Group> {
  const today = todayKey();
  let rows: { phoneNumber: string; name: string | null }[] = [];

  if (key === "numbers") {
    const { numbers, invalid } = parseNumbers(numbersText);
    const known = new Map((await customersByPhone(numbers)).map((u) => [u.phoneNumber, u.name]));
    // a typed list is sent as typed: an unknown number is a friend, not a customer; nobody is left out for their preferences
    return { people: numbers.map((p) => ({ phone: p, name: known.has(p) ? first(known.get(p) ?? null, p) : "Friend" })), optedOut: 0, invalid };
  }

  if (key === "all") rows = await customersByPhone(null);
  else if (key === "members") {
    const [club, subs] = await Promise.all([
      prisma.clubMember.findMany({ where: { validUntil: { gte: new Date() } }, select: { userId: true } }),
      prisma.membershipSubscription.findMany({ where: { status: "active", endDate: { gte: new Date() } }, select: { userId: true } }),
    ]);
    rows = await customersByPhone([...new Set([...club.map((c) => c.userId), ...subs.map((s) => s.userId)])]);
  } else if (key === "vip") {
    rows = await customersByPhone((await prisma.vipCode.findMany({ where: { active: true }, select: { userId: true } })).map((v) => v.userId));
  } else if (key === "played30" || key === "lapsed60") {
    const days = key === "played30" ? 30 : 60;
    const played = (await prisma.booking.groupBy({ by: ["userId"], where: { userId: { not: null }, date: { gte: addDaysKey(today, -days) }, status: { in: ["confirmed", "completed"] } } })).map((b) => b.userId as string);
    if (key === "played30") rows = await customersByPhone(played);
    else rows = (await customersByPhone(null, { createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } })).filter((u) => !new Set(played).has(u.phoneNumber));
  } else if (key === "birthday") {
    rows = await customersByPhone(null, { dateOfBirth: { not: null }, OR: birthdayEndings(today).map((e) => ({ dateOfBirth: { endsWith: e } })) });
  } else if (key === "new7") {
    rows = await customersByPhone(null, { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
  }

  rows = rows.filter((r) => PHONE.test(r.phoneNumber));
  // people who switched off "Promotional notifications" in the app are left out
  const off = new Set((await prisma.userPrefs.findMany({ where: { promoNotifications: false, userId: { in: rows.map((r) => r.phoneNumber) } }, select: { userId: true } })).map((p) => p.userId));
  const kept = rows.filter((r) => !off.has(r.phoneNumber));
  return { people: kept.map((r) => ({ phone: r.phoneNumber, name: first(r.name, r.phoneNumber) })), optedOut: rows.length - kept.length, invalid: 0 };
}

const audienceSchema = z.object({ audience: z.enum(AUDIENCES.map((a) => a.key) as [AudienceKey, ...AudienceKey[]]), numbers: z.string().max(20000).optional() });
const bodySchema = z.string().trim().min(5, "Write at least a few words").max(MAX_LEN, `Keep it under ${MAX_LEN} characters`);

function checkBody(body: string) {
  const unknown = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((n) => n !== "name");
  if (unknown.length) throw new AppError(400, `Only {name} can be used in a mass message (not ${unknown.map((n) => `{${n}}`).join(", ")}).`);
  if (/\{[^}]*$|^[^{]*\}/.test(body.replace(/\{\w+\}/g, ""))) throw new AppError(400, "A { or } is left open. Write the customer's name as {name}.");
}
const personal = (body: string, name: string) => body.replace(/\{name\}/g, name);

// ---- who can be reached ----------------------------------------------------------------------------------------

smsMassRouter.get("/audiences", requirePermission("sms.view"), handler(async (_req, res) => {
  const counts = await Promise.all(AUDIENCES.filter((a) => a.key !== "numbers").map(async (a) => [a.key, (await group(a.key)).people.length] as const));
  const c = new Map<string, number>(counts);
  send(res, { configured: smsConfigured(), max: MAX_RECIPIENTS, maxLength: MAX_LEN, audiences: AUDIENCES.map((a) => ({ ...a, count: a.key === "numbers" ? null : c.get(a.key) ?? 0 })) });
}));

smsMassRouter.post("/campaigns/preview", requirePermission("sms.view"), handler(async (req, res) => {
  const a = parse(audienceSchema, req.body);
  const g = await group(a.audience, a.numbers);
  send(res, { count: g.people.length, optedOut: g.optedOut, invalid: g.invalid, sample: g.people.slice(0, 3), tooMany: g.people.length > MAX_RECIPIENTS });
}));

// ---- sending ----------------------------------------------------------------------------------------------------

const running = new Map<string, { stop: boolean }>();

async function runCampaign(id: string, people: Person[], body: string) {
  const flag = { stop: false };
  running.set(id, flag);
  let sent = 0;
  let failed = 0;
  try {
    for (let i = 0; i < people.length && !flag.stop; i += CONCURRENCY) {
      const slice = people.slice(i, i + CONCURRENCY);
      const results = await Promise.all(slice.map((p) => sendSms({ phone: p.phone, message: personal(body, p.name), kind: "mass", name: p.name })));
      for (const r of results) r.ok ? sent++ : failed++;
      await prisma.smsCampaign.update({ where: { id }, data: { sent, failed } }).catch(() => undefined);
    }
  } finally {
    running.delete(id);
    await prisma.smsCampaign.update({ where: { id }, data: { sent, failed, status: flag.stop ? "stopped" : "done", finishedAt: new Date() } }).catch(() => undefined);
  }
}

const startSchema = audienceSchema.extend({ body: bodySchema, title: z.string().trim().max(80).optional(), expected: z.number().int().min(1) });

smsMassRouter.post("/campaigns", requirePermission("sms.send"), handler(async (req, res) => {
  const d = parse(startSchema, req.body);
  checkBody(d.body);
  if (!smsConfigured()) throw new AppError(503, "The SMS gateway is not set up on the admin server yet, so nothing can be sent. Ask the developer to add the SMS settings.");
  const g = await group(d.audience, d.numbers);
  if (g.people.length === 0) throw new AppError(400, "Nobody to send to.");
  if (g.people.length > MAX_RECIPIENTS) throw new AppError(400, `That is ${g.people.length} people. One send is limited to ${MAX_RECIPIENTS}: pick a smaller group.`);
  if (g.people.length !== d.expected) throw new AppError(409, `The group changed: it is now ${g.people.length} people (you reviewed ${d.expected}). Please review again.`);
  if (await prisma.smsCampaign.findFirst({ where: { status: "sending" }, select: { id: true } }).then((c) => c && running.has(c.id))) throw new AppError(409, "A mass message is still being sent. Wait for it to finish, or stop it, before starting another.");

  const campaign = await prisma.smsCampaign.create({
    data: { createdByName: req.staff?.name ?? "staff", title: d.title || d.body.slice(0, 40), body: d.body, audience: d.audience, audienceLabel: audienceLabel(d.audience), total: g.people.length },
  });
  await audit(req, "sms.campaign.start", "SmsCampaign", campaign.id, { audience: d.audience, total: g.people.length, body: d.body.slice(0, 200) });
  void runCampaign(campaign.id, g.people, d.body); // in the background: the page watches the progress
  send(res, campaign, "Sending started", 201);
}));

smsMassRouter.get("/campaigns", requirePermission("sms.view"), handler(async (_req, res) => {
  // a send that was under way when the server restarted cannot continue: show it as stopped
  await prisma.smsCampaign.updateMany({ where: { status: "sending", id: { notIn: [...running.keys()] } }, data: { status: "stopped", finishedAt: new Date() } });
  const rows = await prisma.smsCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  send(res, rows.map((c) => ({ ...c, parts: smsParts(c.body) })));
}));

smsMassRouter.post("/campaigns/:id/stop", requirePermission("sms.send"), handler(async (req, res) => {
  const id = param(req, "id");
  const flag = running.get(id);
  if (!flag) throw new AppError(409, "This send is not running.");
  flag.stop = true;
  await audit(req, "sms.campaign.stop", "SmsCampaign", id);
  send(res, { id }, "Stopping: the messages already handed to the gateway still go out.");
}));

smsMassRouter.post("/campaigns/test", requirePermission("sms.send"), handler(async (req, res) => {
  const d = parse(z.object({ body: bodySchema, phone: z.string() }), req.body);
  checkBody(d.body);
  const { numbers } = parseNumbers(d.phone);
  if (numbers.length !== 1) throw new AppError(400, "Enter one 10-digit mobile number starting with 9.");
  const r = await sendSms({ phone: numbers[0], message: personal(d.body, "Friend"), kind: "test", name: "Test" });
  if (!r.ok) throw new AppError(502, `The test text was not sent: ${r.error}`);
  send(res, { phone: numbers[0] }, "Test text sent");
}));

// ---- login details for new customers ----------------------------------------------------------------------

smsMassRouter.get("/new-customers", requirePermission("sms.view"), handler(async (req, res) => {
  const days = Math.min(Math.max(Number((req.query as Record<string, string>).days) || 14, 1), 60);
  const users = await prisma.user.findMany({
    where: { role: "user", createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    select: { phoneNumber: true, name: true, createdAt: true, isActive: true, dateOfBirth: true },
    orderBy: { createdAt: "desc" }, take: 200,
  });
  const sent = await prisma.smsLog.groupBy({ by: ["phoneNumber"], where: { kind: "login_details", phoneNumber: { in: users.map((u) => u.phoneNumber) } }, _max: { createdAt: true } });
  const at = new Map(sent.map((s) => [s.phoneNumber, s._max.createdAt]));
  const today = todayKey();
  send(res, {
    days, configured: smsConfigured(),
    items: users.map((u) => ({ phone: u.phoneNumber, name: u.name, createdAt: u.createdAt, active: u.isActive, age: u.dateOfBirth ? ageOn(u.dateOfBirth, today) : null, detailsSentAt: at.get(u.phoneNumber) ?? null })),
  });
}));

smsMassRouter.post("/login-details", requirePermission("sms.send"), handler(async (req, res) => {
  const { phones } = parse(z.object({ phones: z.array(z.string()).min(1).max(100) }), req.body);
  if (!smsConfigured()) throw new AppError(503, "The SMS gateway is not set up on the admin server yet, so nothing can be sent. Ask the developer to add the SMS settings.");
  const unique = [...new Set(phones)].filter((p) => PHONE.test(p));
  const users = await customersByPhone(unique);
  const link = (process.env.CUSTOMER_APP_URL || "https://www.uniquefutsal.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const results: { phone: string; ok: boolean; error?: string }[] = [];
  for (const u of users) {
    const message = await renderTemplate("login_details", { name: first(u.name, u.phoneNumber), phone: u.phoneNumber, link });
    const r = await sendSms({ phone: u.phoneNumber, message, kind: "login_details", name: u.name });
    results.push({ phone: u.phoneNumber, ok: r.ok, error: r.error });
  }
  const sent = results.filter((r) => r.ok).length;
  await audit(req, "sms.login-details", "User", null, { requested: unique.length, sent });
  send(res, { sent, failed: results.length - sent, skipped: unique.length - results.length, results }, sent ? `Login details sent to ${sent} customer${sent === 1 ? "" : "s"}` : "Nothing was sent");
}));
