// Letter Head: the company details printed on letters. Name, address, phone and email are the venue details from Settings;
// the registration number and website are kept in their own Settings key. The letter is made in the browser; what is kept is its text (so it can be shown and printed again) and its record: a reference number (2026-123: the year of the letter and 3 random digits, never repeated) and a verification number,
// as a document code (the same table as Verify Documents, so a letter can also be withdrawn there). GET /letters?q= finds a letter again (nothing is listed without a search).
import { Router } from "express";
import { z } from "zod";
import { audit } from "../lib/audit";
import { prisma } from "../db";
import { AppError, handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { loadVenue } from "./settings-page";
import { getJson, setSetting } from "./settings-store";
import { createWithCode } from "./verify";

export const letterheadRouter = Router();

const KEY = "letterHead";
const DEFAULTS = { panNo: "", website: "www.uniquefutsal.com" };

async function company() {
  const [venue, saved] = await Promise.all([loadVenue(), getJson<Partial<typeof DEFAULTS>>(KEY, {})]);
  return { name: venue.name, address: venue.address, phone: venue.phone, email: venue.email, ...DEFAULTS, ...saved };
}

letterheadRouter.get("/", requirePermission("letterhead.make"), handler(async (_req, res) => {
  send(res, await company());
}));

letterheadRouter.put("/", requirePermission("letterhead.make"), handler(async (req, res) => {
  const b = parse(z.object({ panNo: z.string().trim().max(20), website: z.string().trim().max(120) }), req.body);
  await setSetting(KEY, JSON.stringify(b));
  await audit(req, "update-letter-head", "settings", KEY, b);
  send(res, await company(), "Company details saved");
}));

// ---- the record of each letter made ----
const PREFIX = "Letter Head: ";
const bodyKey = (code: string) => `letterHeadText:${code}`;
const short = (n: number) => z.string().trim().max(n).default("");
const letterText = z.object({
  dear: short(80), body: z.string().max(2000).default(""),
  sender: z.object({ name: short(100), designation: short(100), org: short(120), regNo: short(60), phone: short(60), address: short(200), website: short(120) }),
});

// a new letter: its reference number and verification number
letterheadRouter.post("/issue", requirePermission("letterhead.make"), handler(async (req, res) => {
  const b = parse(z.object({
    subject: z.string().trim().min(3).max(100),
    receiver: z.string().trim().max(120).default(""),
    details: z.string().trim().max(900).default(""),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the date"),
    letter: letterText.optional(),
  }), req.body);
  const year = Number(b.date.slice(0, 4));
  if (year < 2000 || year > 2200) throw new AppError(400, "Check the date");
  let ref = "";
  for (let i = 0; i < 80 && !ref; i++) {
    const candidate = `${year}-${100 + Math.floor(Math.random() * 900)}`;
    const used = await prisma.docVerification.findFirst({ where: { kind: "document", details: { startsWith: `Ref No: ${candidate}\n` } }, select: { id: true } });
    if (!used) ref = candidate;
  }
  if (!ref) throw new AppError(409, `All reference numbers of ${year} are used`);
  const doc = await createWithCode({
    kind: "document", title: PREFIX + b.subject, issuedTo: b.receiver || null, orgType: "other",
    details: `Ref No: ${ref}\nLetter date: ${b.date}${b.details ? `\n${b.details}` : ""}`, issuedBy: req.staff!.name,
  });
  if (b.letter) await setSetting(bodyKey(doc.code), JSON.stringify(b.letter));
  await audit(req, "create", "doc_verification", doc.id, { code: doc.code, ref, letter: true, subject: b.subject });
  send(res, { code: doc.code, ref }, "Letter numbers issued", 201);
}));

// find letters: by reference number, verification number, subject or receiver (newest first); with no search, nothing
letterheadRouter.get("/letters", requirePermission("letterhead.make"), handler(async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const code = q.replace(/\s+/g, "").toUpperCase();
  if (!q) { send(res, []); return; }
  const rows = await prisma.docVerification.findMany({
    where: {
      kind: "document", title: { startsWith: PREFIX },
      OR: [{ code: { contains: code } }, { details: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { issuedTo: { contains: q, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  const texts = await prisma.settings.findMany({ where: { key: { in: rows.map((d) => bodyKey(d.code)) } } });
  const textOf = (c: string) => { try { return JSON.parse(texts.find((t) => t.key === bodyKey(c))?.value ?? "null"); } catch { return null; } };
  send(res, rows.map((d) => ({
    letter: textOf(d.code),
    id: d.id, code: d.code, ref: /^Ref No: (\S+)/.exec(d.details ?? "")?.[1] ?? "", date: /Letter date: (\S+)/.exec(d.details ?? "")?.[1] ?? "",
    subject: (d.title ?? "").slice(PREFIX.length), receiver: d.issuedTo ?? "", issuedBy: d.issuedBy, revoked: !!d.revokedAt, createdAt: d.createdAt,
  })));
}));

// ---- history: browse the letters by year and month (by the date printed on the letter) ----
const letterDay = (d: { details: string | null; createdAt: Date }) => /Letter date: (\d{4}-\d{2}-\d{2})/.exec(d.details ?? "")?.[1] ?? d.createdAt.toISOString().slice(0, 10);
const isLetter = { kind: "document", title: { startsWith: PREFIX } } as const;

// which years and months have letters, and how many
letterheadRouter.get("/history/summary", requirePermission("letterhead.make"), handler(async (_req, res) => {
  const rows = await prisma.docVerification.findMany({ where: isLetter, select: { details: true, createdAt: true } });
  const years = new Map<number, number[]>();
  for (const r of rows) {
    const day = letterDay(r);
    const months = years.get(Number(day.slice(0, 4))) ?? Array<number>(12).fill(0);
    months[Number(day.slice(5, 7)) - 1]++;
    years.set(Number(day.slice(0, 4)), months);
  }
  send(res, [...years].sort((a, b) => b[0] - a[0]).map(([year, months]) => ({ year, months, total: months.reduce((n, c) => n + c, 0) })));
}));

// the letters of one month, newest first, each with its text so it can be shown exactly as it was written
letterheadRouter.get("/history", requirePermission("letterhead.make"), handler(async (req, res) => {
  const q = parse(z.object({ year: z.coerce.number().int().min(2000).max(2200), month: z.coerce.number().int().min(1).max(12) }), req.query);
  const month = `${q.year}-${String(q.month).padStart(2, "0")}`;
  const rows = (await prisma.docVerification.findMany({ where: isLetter, orderBy: { createdAt: "desc" } }))
    .filter((d) => letterDay(d).startsWith(month))
    .sort((a, b) => letterDay(b).localeCompare(letterDay(a)) || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 300);
  const texts = await prisma.settings.findMany({ where: { key: { in: rows.map((d) => bodyKey(d.code)) } } });
  const textOf = (c: string) => { try { return JSON.parse(texts.find((t) => t.key === bodyKey(c))?.value ?? "null"); } catch { return null; } };
  send(res, rows.map((d) => ({
    letter: textOf(d.code),
    id: d.id, code: d.code, ref: /^Ref No: (\S+)/.exec(d.details ?? "")?.[1] ?? "", date: letterDay(d),
    subject: (d.title ?? "").slice(PREFIX.length), receiver: d.issuedTo ?? "", issuedBy: d.issuedBy, revoked: !!d.revokedAt, createdAt: d.createdAt,
  })));
}));
