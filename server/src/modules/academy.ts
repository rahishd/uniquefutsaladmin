// Children's Academy (ages 10 to 14), staff side. The customer app reads the same tables (customer backend /academy).
// Staff publish classes (visible = guardians can see and join), see who is enrolled, mark attendance, and edit the Terms.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { addDaysKey, nowMinutes, todayKey } from "../lib/dates";
import { AppError, dateStr, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { getSetting, setSetting } from "./settings-store";

export const academyRouter = Router();

const TERMS_KEY = "academyTerms";
const HISTORY_KEY = "academyTermsHistory";
const DEFAULT_TERMS = [
  "1. The Children's Academy is for children aged 10 to 14 on the day of the class.",
  "2. The details you give (your contact numbers, the emergency contact and your address) must be correct. We will call the emergency contact if we cannot reach you.",
  "3. Tell us honestly about any health condition or allergy. If your child is unwell on the day, please keep them at home.",
  "4. Please bring sports shoes and a bottle of water, and arrive 10 minutes early.",
  "5. You can cancel a class in the app before it starts. If we have to cancel a class we will tell you in the app.",
  "6. Any fees are agreed and paid at the venue.",
].join("\n");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm");
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hasStarted = (s: { date: string; startTime: string }) => {
  const today = todayKey();
  return s.date < today || (s.date === today && mins(s.startTime) <= nowMinutes());
};

type Terms = { version: number; text: string; updatedAt: string | null; updatedBy?: string | null };
async function getTerms(): Promise<Terms> {
  const v = await getSetting(TERMS_KEY);
  if (v) {
    try {
      const j = JSON.parse(v) as Terms;
      if (typeof j.text === "string" && Number.isInteger(j.version)) return j;
    } catch { /* default below */ }
  }
  return { version: 1, text: DEFAULT_TERMS, updatedAt: null };
}

const ACTIVE = { status: { not: "cancelled" } } as const;

async function taken(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const g = await prisma.academyEnrollment.groupBy({ by: ["sessionId"], where: { sessionId: { in: ids }, ...ACTIVE }, _count: { _all: true } });
  return new Map(g.map((r) => [r.sessionId, r._count._all]));
}

const sessionView = (s: Prisma.AcademySessionGetPayload<object>, enrolled: number) => ({
  id: s.id, title: s.title, date: s.date, startTime: s.startTime, endTime: s.endTime, coach: s.coach, capacity: s.capacity,
  visible: s.visible, status: s.status, enrolled, seatsLeft: Math.max(0, s.capacity - enrolled), started: hasStarted(s),
});

// ---------- overview ----------
academyRouter.get("/overview", requirePermission("academy.view"), handler(async (_req, res) => {
  const today = todayKey();
  const upcoming = await prisma.academySession.findMany({ where: { date: { gte: today }, status: "open" }, select: { id: true, visible: true, date: true, startTime: true } });
  const live = upcoming.filter((s) => !hasStarted(s));
  const t = await taken(live.map((s) => s.id));
  const [withHealth] = await Promise.all([
    prisma.academyEnrollment.count({ where: { sessionId: { in: live.map((s) => s.id) }, ...ACTIVE, healthStatus: "condition" } }),
  ]);
  send(res, {
    upcomingClasses: live.length, visibleClasses: live.filter((s) => s.visible).length,
    enrolledChildren: [...t.values()].reduce((a, b) => a + b, 0), withHealthNotes: withHealth,
  });
}));

// ---------- classes ----------
academyRouter.get("/sessions", requirePermission("academy.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const today = todayKey();
  const past = q.scope === "past";
  const rows = await prisma.academySession.findMany({
    where: past ? { date: { lt: today } } : { date: { gte: today } },
    orderBy: past ? [{ date: "desc" }, { startTime: "desc" }] : [{ date: "asc" }, { startTime: "asc" }], take: 120,
  });
  const t = await taken(rows.map((s) => s.id));
  send(res, rows.map((s) => sessionView(s, t.get(s.id) ?? 0)));
}));

const createSchema = z.object({
  date: dateStr, startTime: hhmm, endTime: hhmm,
  title: z.string().trim().min(2).max(80).optional(), coach: z.string().trim().max(60).optional(),
  capacity: z.number().int().min(1).max(100).default(15), visible: z.boolean().default(true),
  repeatWeeks: z.number().int().min(0).max(12).default(0), // also create the same class on the following weeks
});

academyRouter.post("/sessions", requirePermission("academy.sessions"), handler(async (req, res) => {
  const b = parse(createSchema, req.body);
  if (mins(b.endTime) <= mins(b.startTime)) throw new AppError(400, "The class must end after it starts");
  const dates = Array.from({ length: b.repeatWeeks + 1 }, (_, i) => addDaysKey(b.date, i * 7));
  if (dates[0] < todayKey() || hasStarted({ date: dates[0], startTime: b.startTime })) throw new AppError(400, "Choose a time in the future");
  const created = [];
  for (const date of dates) {
    const dup = await prisma.academySession.findFirst({ where: { date, startTime: b.startTime, status: "open" } });
    if (dup) { if (dates.length === 1) throw new AppError(409, "A class already starts at that time"); continue; }
    created.push(await prisma.academySession.create({
      data: { date, startTime: b.startTime, endTime: b.endTime, title: b.title ?? "Children's Academy class", coach: b.coach || null, capacity: b.capacity, visible: b.visible, createdBy: req.staff!.id },
    }));
  }
  await audit(req, "create", "academy_session", created[0]?.id, { dates, startTime: b.startTime, capacity: b.capacity, visible: b.visible });
  send(res, created.map((s) => sessionView(s, 0)), `${created.length} class${created.length === 1 ? "" : "es"} added`, 201);
}));

const patchSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(), coach: z.string().trim().max(60).nullable().optional(),
  capacity: z.number().int().min(1).max(100).optional(), visible: z.boolean().optional(),
  date: dateStr.optional(), startTime: hhmm.optional(), endTime: hhmm.optional(),
});

academyRouter.patch("/sessions/:id", requirePermission("academy.sessions"), handler(async (req, res) => {
  const b = parse(patchSchema, req.body);
  const s = await prisma.academySession.findUnique({ where: { id: param(req, "id") } });
  if (!s) throw new AppError(404, "Class not found");
  if (s.status === "cancelled") throw new AppError(409, "This class was cancelled");
  const enrolled = (await taken([s.id])).get(s.id) ?? 0;
  const movesTime = (b.date && b.date !== s.date) || (b.startTime && b.startTime !== s.startTime) || (b.endTime && b.endTime !== s.endTime);
  if (movesTime && enrolled > 0) throw new AppError(409, "Children are already enrolled, so the date and time cannot change. Cancel the class and add a new one.");
  if (b.capacity !== undefined && b.capacity < enrolled) throw new AppError(409, `${enrolled} children are enrolled, so the capacity cannot be below ${enrolled}`);
  const next = { date: b.date ?? s.date, startTime: b.startTime ?? s.startTime, endTime: b.endTime ?? s.endTime };
  if (mins(next.endTime) <= mins(next.startTime)) throw new AppError(400, "The class must end after it starts");
  if (movesTime && hasStarted(next)) throw new AppError(400, "Choose a time in the future");
  const upd = await prisma.academySession.update({
    where: { id: s.id },
    data: { ...next, ...(b.title !== undefined ? { title: b.title } : {}), ...(b.coach !== undefined ? { coach: b.coach || null } : {}), ...(b.capacity !== undefined ? { capacity: b.capacity } : {}), ...(b.visible !== undefined ? { visible: b.visible } : {}) },
  });
  await audit(req, "update", "academy_session", s.id, b);
  send(res, sessionView(upd, enrolled), "Saved");
}));

academyRouter.post("/sessions/:id/cancel", requirePermission("academy.sessions"), handler(async (req, res) => {
  const reason = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {}).reason;
  const s = await prisma.academySession.findUnique({ where: { id: param(req, "id") } });
  if (!s) throw new AppError(404, "Class not found");
  if (s.status === "cancelled") throw new AppError(409, "Already cancelled");
  const people = await prisma.academyEnrollment.findMany({ where: { sessionId: s.id, status: "confirmed" } });
  await prisma.$transaction([
    prisma.academySession.update({ where: { id: s.id }, data: { status: "cancelled", visible: false } }),
    prisma.academyEnrollment.updateMany({ where: { sessionId: s.id, status: "confirmed" }, data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "staff" } }),
  ]);
  for (const e of people) {
    await notify(prisma, { userId: e.userId, type: "academy", title: "Academy class cancelled", message: `The class on ${s.date} at ${s.startTime} was cancelled by the venue.${reason ? ` ${reason}` : ""} Please pick another time.`, href: "/academy", dedupeKey: `academy-cancel-${e.id}` });
  }
  await audit(req, "cancel", "academy_session", s.id, { date: s.date, startTime: s.startTime, notified: people.length, reason });
  send(res, { cancelledEnrollments: people.length }, `Class cancelled. ${people.length} guardian${people.length === 1 ? "" : "s"} told.`);
}));

// ---------- enrolled children ----------
const view = (e: Prisma.AcademyEnrollmentGetPayload<{ include: { session: true } }>) => ({
  id: e.id, code: e.code, status: e.status, childName: e.childName, childAge: e.childAge, healthStatus: e.healthStatus, healthNotes: e.healthNotes,
  guardianName: e.guardianName, guardianPhone: e.guardianPhone, emergencyPhone: e.emergencyPhone, address: e.address,
  termsVersion: e.termsVersion, termsAcceptedAt: e.termsAcceptedAt, createdAt: e.createdAt, cancelledBy: e.cancelledBy,
  session: { id: e.session.id, title: e.session.title, date: e.session.date, startTime: e.session.startTime, endTime: e.session.endTime, status: e.session.status, started: hasStarted(e.session) },
});

academyRouter.get("/enrollments", requirePermission("academy.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const text = q.q?.trim().slice(0, 60);
  const status = q.status && ["confirmed", "cancelled", "attended", "no_show"].includes(q.status) ? q.status : undefined;
  const where: Prisma.AcademyEnrollmentWhereInput = {
    ...(q.sessionId ? { sessionId: q.sessionId } : {}), ...(status ? { status } : {}),
    ...(q.health === "condition" ? { healthStatus: "condition" } : {}),
    ...(text ? { OR: [{ childName: { contains: text, mode: "insensitive" } }, { guardianName: { contains: text, mode: "insensitive" } }, { guardianPhone: { contains: text } }, { code: { contains: text, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.academyEnrollment.findMany({ where, include: { session: true }, orderBy: [{ session: { date: "desc" } }, { createdAt: "desc" }], take, skip }),
    prisma.academyEnrollment.count({ where }),
  ]);
  send(res, { items: rows.map(view), total, page: pageNo, limit });
}));

academyRouter.post("/enrollments/:id/attendance", requirePermission("academy.enrollments"), handler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(["attended", "no_show", "confirmed"]) }), req.body);
  const e = await prisma.academyEnrollment.findUnique({ where: { id: param(req, "id") }, include: { session: true } });
  if (!e) throw new AppError(404, "Enrolment not found");
  if (e.status === "cancelled") throw new AppError(409, "This enrolment was cancelled");
  if (b.status !== "confirmed" && !hasStarted(e.session)) throw new AppError(409, "The class has not started yet");
  const upd = await prisma.academyEnrollment.update({ where: { id: e.id }, data: { status: b.status }, include: { session: true } });
  await audit(req, "attendance", "academy_enrollment", e.id, { code: e.code, status: b.status });
  send(res, view(upd), "Saved");
}));

academyRouter.post("/enrollments/:id/cancel", requirePermission("academy.enrollments"), handler(async (req, res) => {
  const e = await prisma.academyEnrollment.findUnique({ where: { id: param(req, "id") }, include: { session: true } });
  if (!e) throw new AppError(404, "Enrolment not found");
  if (e.status === "cancelled") throw new AppError(409, "Already cancelled");
  const upd = await prisma.academyEnrollment.update({ where: { id: e.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "staff" }, include: { session: true } });
  await notify(prisma, { userId: e.userId, type: "academy", title: "Academy class cancelled", message: `${e.childName}'s class on ${e.session.date} at ${e.session.startTime} was cancelled by the venue. Please call us or pick another time.`, href: "/academy", dedupeKey: `academy-cancel-${e.id}` });
  await audit(req, "cancel", "academy_enrollment", e.id, { code: e.code });
  send(res, view(upd), "Cancelled. The guardian has been told.");
}));

// ---------- terms ----------
academyRouter.get("/terms", requirePermission("academy.view"), handler(async (_req, res) => {
  const history = await getSetting(HISTORY_KEY);
  send(res, { ...(await getTerms()), history: history ? (JSON.parse(history) as Terms[]) : [] });
}));

academyRouter.put("/terms", requirePermission("academy.terms"), handler(async (req, res) => {
  const b = parse(z.object({ text: z.string().trim().min(20, "Write the terms (at least 20 characters)").max(5000, "Keep the terms under 5000 characters") }), req.body);
  const cur = await getTerms();
  if (b.text === cur.text) throw new AppError(409, "Nothing changed");
  const next: Terms = { version: cur.version + 1, text: b.text, updatedAt: new Date().toISOString(), updatedBy: req.staff!.name };
  const old = await getSetting(HISTORY_KEY);
  const history = [{ ...cur }, ...(old ? (JSON.parse(old) as Terms[]) : [])].slice(0, 20);
  await setSetting(HISTORY_KEY, JSON.stringify(history));
  await setSetting(TERMS_KEY, JSON.stringify(next));
  await audit(req, "update", "academy_terms", null, { version: next.version });
  send(res, { ...next, history }, `Terms saved as version ${next.version}. Guardians must accept this version to enrol.`);
}));
