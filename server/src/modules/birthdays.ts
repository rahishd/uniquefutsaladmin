// Site Content > Birthdays: customers whose birthday is today (from the date of birth asked at sign-up), and a way for staff
// to wish them happy birthday, with or without one of the promo codes. Wishes arrive in the customer's bell (and as a push
// when the app is closed). One wish per customer per year, so pressing Send twice never sends two.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { ageOn } from "../lib/age";
import { todayKey } from "../lib/dates";
import { AppError, handler, parse, send } from "../lib/http";
import { pushEnabled, pushToUsers } from "../lib/push";
import { requirePermission } from "../middleware/auth";
import { getPromoCodes, PromoCode } from "./settings-store";

export const birthdaysRouter = Router();

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The "-MM-DD" endings of birth dates that have their birthday on `today`. 29 Feb is celebrated on 28 Feb in a year without one. */
export function birthdayEndings(today: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const md = `-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return m === 2 && d === 28 && !isLeap(y) ? [md, "-02-29"] : [md];
}

const firstName = (name: string | null, phone: string) => (name ?? "").trim().split(/\s+/)[0] || `Player ${phone.slice(-4)}`;

// codes staff can attach: switched on and not past their last day
const usableCodes = (codes: PromoCode[], today: string) => codes.filter((c) => c.isActive !== false && (!c.expiryDate || c.expiryDate >= today));

async function birthdayPeople(today: string) {
  const users = await prisma.user.findMany({
    where: { role: "user", isActive: true, dateOfBirth: { not: null }, OR: birthdayEndings(today).map((e) => ({ dateOfBirth: { endsWith: e } })) },
    select: { phoneNumber: true, name: true, dateOfBirth: true, avatar: true },
    orderBy: { name: "asc" },
  });
  const year = today.slice(0, 4);
  const wished = new Set((await prisma.notification.findMany({ where: { dedupeKey: { in: users.map((u) => `birthday-${year}-${u.phoneNumber}`) } }, select: { userId: true } })).map((n) => n.userId));
  return users.map((u) => ({ phone: u.phoneNumber, name: u.name?.trim() || `Player ${u.phoneNumber.slice(-4)}`, dob: u.dateOfBirth!, age: ageOn(u.dateOfBirth!, today), wished: wished.has(u.phoneNumber) }));
}

/** Birthdays today that have not been wished yet (the badge on the Birthdays tab). */
export const birthdaysToWish = async (today: string = todayKey()) => (await birthdayPeople(today)).filter((p) => !p.wished).length;

birthdaysRouter.get("/", requirePermission("content.view"), handler(async (_req, res) => {
  const today = todayKey();
  const [people, codes] = await Promise.all([birthdayPeople(today), getPromoCodes()]);
  send(res, {
    date: today,
    people,
    promoCodes: usableCodes(codes, today).map((c) => ({ code: c.code, label: c.label, title: c.title ?? null, type: c.type, value: c.value, expiryDate: c.expiryDate ?? null, appliedTo: c.appliedTo })),
  });
}));

export const DEFAULT_WISH = "Happy Birthday, {name}! Wishing you a great year of football from everyone at Unique Futsal.";

birthdaysRouter.post("/wish", requirePermission("content.birthdays"), handler(async (req, res) => {
  const b = parse(z.object({
    phones: z.array(z.string().regex(/^\d{10}$/)).min(1, "Select at least one customer").max(500),
    message: z.string().trim().min(2).max(200).optional(), // {name} becomes the customer's first name
    promoCode: z.string().trim().min(3).max(20).optional(),
  }), req.body);

  const today = todayKey();
  const year = today.slice(0, 4);
  let code: PromoCode | undefined;
  if (b.promoCode) {
    code = usableCodes(await getPromoCodes(), today).find((c) => c.code.toUpperCase() === b.promoCode!.toUpperCase());
    if (!code) throw new AppError(400, "That promo code is not active. Pick another one or send the wish without a code.");
  }

  // only people who really have their birthday today, whatever the page sent
  const people = (await birthdayPeople(today)).filter((p) => b.phones.includes(p.phone));
  if (people.length === 0) throw new AppError(404, "None of the selected customers has a birthday today.");

  // a wish that carries a promo code is a promotion: customers who switched promotional notices off do not get it
  const optedOut = code ? new Set((await prisma.userPrefs.findMany({ where: { promoNotifications: false, userId: { in: people.map((p) => p.phone) } }, select: { userId: true } })).map((p) => p.userId)) : new Set<string>();
  const alreadyWished = people.filter((p) => p.wished).length;
  const targets = people.filter((p) => !p.wished && !optedOut.has(p.phone));

  const template = b.message ?? DEFAULT_WISH;
  const gift = code ? ` A birthday gift: use code ${code.code} (${code.label}) on your next booking.` : "";
  const title = "Happy Birthday!"; // no emoji: the local Windows test database is not UTF-8
  const href = code ? "/promos" : "/";
  const batch = `birthday-${year}-${Date.now()}`;

  const made = await prisma.notification.createMany({
    data: targets.map((p) => ({
      userId: p.phone, type: code ? "promo" : "general", title,
      message: `${template.split("{name}").join(firstName(p.name, p.phone))}${gift}`.slice(0, 400),
      href, dedupeKey: `birthday-${year}-${p.phone}`,
    })),
    skipDuplicates: true,
  });

  // devices with the app closed: the text is personal, so each person gets their own push
  let pushed = 0;
  for (let i = 0; i < targets.length; i += 20) {
    const chunk = targets.slice(i, i + 20);
    const r = await Promise.all(chunk.map((p) => pushToUsers([p.phone], { title, body: `${template.split("{name}").join(firstName(p.name, p.phone))}${gift}`.slice(0, 200), href, tag: `${batch}-${p.phone}` })));
    pushed += r.reduce((n, x) => n + x.customers, 0);
  }

  await audit(req, "birthday_wish", "notification", batch, { sent: made.count, promoCode: code?.code ?? null, alreadyWished, skippedOptOut: people.filter((p) => !p.wished && optedOut.has(p.phone)).length });
  send(res, { sent: made.count, alreadyWished, skippedOptOut: people.filter((p) => !p.wished && optedOut.has(p.phone)).length, pushed, pushEnabled: pushEnabled() }, "Birthday wishes sent", 201);
}));
