// Reminders: staff set a title and a time (Nepal time). When it is due the portal pops it up for the person it is for, and a phone alert is
// sent, again every REPEAT_MS, until someone marks it done (or it is 12 hours overdue). A reminder is for one staff member or for everyone.
// A daily reminder sets itself again for the next day once it is marked done.
import { Prisma, Reminder } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { AppError, dateStr, handler, parse, send } from "../lib/http";
import { pushEnabled, pushToStaff } from "../lib/push";
import { requirePermission } from "../middleware/auth";

export const remindersRouter = Router();

export const REPEAT_MS = 10 * 60 * 1000; // how often a phone alert repeats while a reminder is left
export const GIVE_UP_MS = 12 * 60 * 60 * 1000; // phone alerts stop this long after the time
const DAY_MS = 24 * 60 * 60 * 1000;
const SNOOZE_MINUTES = [5, 10, 30, 60] as const;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const dueAt = (date: string, time: string) => new Date(`${date}T${time}:00+05:45`); // Nepal time

const body = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullish(),
  date: dateStr,
  time: clock,
  repeat: z.enum(["none", "daily"]).default("none"),
  forStaffId: z.string().nullish(), // empty = everyone
});

async function staffNames(ids: string[]) {
  const rows = ids.length ? await prisma.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function shape(rows: Reminder[]) {
  const names = await staffNames([...new Set(rows.map((r) => r.forStaffId).filter((x): x is string => !!x))]);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, title: r.title, note: r.note, dueAt: r.dueAt, repeat: r.repeat, status: r.status,
    forStaffId: r.forStaffId, forName: r.forStaffId ? (names.get(r.forStaffId) ?? "Former staff") : "Everyone",
    createdByName: r.createdByName, doneAt: r.doneAt, doneByName: r.doneByName, snoozedUntil: r.snoozedUntil,
    overdue: r.status === "open" && r.dueAt.getTime() <= now,
  }));
}

// what this person is allowed to see: reminders for everyone or for them; people who manage reminders see all of them
const mine = (staff: { id: string; permissions: string[] }): Prisma.ReminderWhereInput =>
  staff.permissions.includes("reminders.view") || staff.permissions.includes("reminders.manage") ? {} : { OR: [{ forStaffId: null }, { forStaffId: staff.id }] };

async function load(id: string) {
  const r = await prisma.reminder.findUnique({ where: { id } });
  if (!r) throw new AppError(404, "Reminder not found");
  return r;
}

const canAct = (r: Reminder, staff: { id: string; permissions: string[] }) =>
  r.forStaffId === null || r.forStaffId === staff.id || staff.permissions.includes("reminders.manage");

async function checkAudience(forStaffId: string | null | undefined) {
  if (!forStaffId) return null;
  const s = await prisma.staffUser.findUnique({ where: { id: forStaffId }, select: { isActive: true } });
  if (!s || !s.isActive) throw new AppError(400, "That staff member is not available");
  return forStaffId;
}

// Reminders that are due for me right now: the portal shows them as a pop-up (it asks every few seconds). Needs no special permission:
// a person always gets the reminders that are for them or for everyone.
remindersRouter.get("/due", handler(async (req, res) => {
  const now = new Date();
  const rows = await prisma.reminder.findMany({
    where: { status: "open", dueAt: { lte: now }, AND: [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }, { OR: [{ forStaffId: null }, { forStaffId: req.staff!.id }] }] },
    orderBy: { dueAt: "asc" },
    take: 20,
  });
  send(res, await shape(rows));
}));

// Who a reminder can be for (names only), for the picker on the page
remindersRouter.get("/staff", requirePermission("reminders.manage"), handler(async (_req, res) => {
  send(res, await prisma.staffUser.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }));
}));

remindersRouter.get("/", handler(async (req, res) => {
  const staff = req.staff!;
  const [open, done] = await Promise.all([
    prisma.reminder.findMany({ where: { status: "open", ...mine(staff) }, orderBy: { dueAt: "asc" }, take: 200 }),
    prisma.reminder.findMany({ where: { status: "done", doneAt: { gte: new Date(Date.now() - 7 * DAY_MS) }, ...mine(staff) }, orderBy: { doneAt: "desc" }, take: 50 }),
  ]);
  send(res, { open: await shape(open), done: await shape(done), canManage: staff.permissions.includes("reminders.manage") });
}));

remindersRouter.post("/", requirePermission("reminders.manage"), handler(async (req, res) => {
  const b = parse(body, req.body);
  const forStaffId = await checkAudience(b.forStaffId);
  const r = await prisma.reminder.create({
    data: { title: b.title, note: b.note || null, dueAt: dueAt(b.date, b.time), repeat: b.repeat, forStaffId, createdById: req.staff!.id, createdByName: req.staff!.name },
  });
  await audit(req, "create", "reminder", r.id, { title: r.title, dueAt: r.dueAt, repeat: r.repeat, forStaffId });
  send(res, (await shape([r]))[0], "Reminder added", 201);
}));

remindersRouter.patch("/:id", requirePermission("reminders.manage"), handler(async (req, res) => {
  const old = await load(String(req.params.id));
  const b = parse(body.partial(), req.body);
  const data: Prisma.ReminderUpdateInput = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.note !== undefined) data.note = b.note || null;
  if (b.repeat !== undefined) data.repeat = b.repeat;
  if (b.forStaffId !== undefined) data.forStaffId = await checkAudience(b.forStaffId);
  if (b.date !== undefined || b.time !== undefined) {
    const nep = new Date(old.dueAt.getTime() + 5.75 * 3_600_000).toISOString(); // the old time as Nepal clock text
    data.dueAt = dueAt(b.date ?? nep.slice(0, 10), b.time ?? nep.slice(11, 16));
    data.snoozedUntil = null;
    data.lastNotifiedAt = null; // a new time starts alerting again
  }
  const r = await prisma.reminder.update({ where: { id: old.id }, data });
  await audit(req, "update", "reminder", r.id, b);
  send(res, (await shape([r]))[0], "Reminder saved");
}));

remindersRouter.delete("/:id", requirePermission("reminders.manage"), handler(async (req, res) => {
  const r = await load(String(req.params.id));
  await prisma.reminder.delete({ where: { id: r.id } });
  await audit(req, "delete", "reminder", r.id, { title: r.title });
  send(res, { id: r.id }, "Reminder deleted");
}));

// Done: for the person it is for (or for everyone), or anyone who manages reminders. A daily reminder is set again for its next time.
remindersRouter.post("/:id/done", handler(async (req, res) => {
  const staff = req.staff!;
  const r = await load(String(req.params.id));
  if (!canAct(r, staff)) throw new AppError(403, "This reminder is for someone else");
  if (r.status === "done") return send(res, (await shape([r]))[0], "Already done");
  const now = new Date();
  const done = await prisma.reminder.update({ where: { id: r.id }, data: { status: "done", doneAt: now, doneByName: staff.name, snoozedUntil: null } });
  if (r.repeat === "daily") {
    let next = r.dueAt.getTime() + DAY_MS;
    while (next <= now.getTime()) next += DAY_MS;
    await prisma.reminder.create({ data: { title: r.title, note: r.note, dueAt: new Date(next), repeat: "daily", forStaffId: r.forStaffId, createdById: r.createdById, createdByName: r.createdByName } });
  }
  await audit(req, "done", "reminder", r.id, { title: r.title });
  send(res, (await shape([done]))[0], "Marked done");
}));

remindersRouter.post("/:id/snooze", handler(async (req, res) => {
  const staff = req.staff!;
  const r = await load(String(req.params.id));
  if (!canAct(r, staff)) throw new AppError(403, "This reminder is for someone else");
  if (r.status !== "open") throw new AppError(409, "This reminder is already done");
  const { minutes } = parse(z.object({ minutes: z.number().refine((m) => (SNOOZE_MINUTES as readonly number[]).includes(m), `Choose ${SNOOZE_MINUTES.join(", ")} minutes`) }), req.body);
  const until = new Date(Date.now() + minutes * 60_000);
  const updated = await prisma.reminder.update({ where: { id: r.id }, data: { snoozedUntil: until, lastNotifiedAt: until } }); // no phone alert until the snooze ends
  send(res, (await shape([updated]))[0], `Reminder again in ${minutes} minutes`);
}));

/** One pass: send a phone alert for every reminder that is due and still open, and again every REPEAT_MS. Returns how many alerts went out. */
export async function pushDueReminders(now = new Date()): Promise<number> {
  if (!pushEnabled()) return 0;
  const due = await prisma.reminder.findMany({
    where: {
      status: "open", dueAt: { lte: now, gte: new Date(now.getTime() - GIVE_UP_MS) },
      AND: [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }, { OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lte: new Date(now.getTime() - REPEAT_MS) } }] }],
    },
  });
  if (!due.length) return 0;
  const devices = await prisma.staffPushSubscription.findMany({ distinct: ["staffId"], select: { staffId: true } });
  const withPhone = new Set(devices.map((d) => d.staffId));
  let sent = 0;
  for (const r of due) {
    let targets: string[];
    if (r.forStaffId) targets = withPhone.has(r.forStaffId) ? [r.forStaffId] : [];
    else {
      const active = await prisma.staffUser.findMany({ where: { id: { in: [...withPhone] }, isActive: true }, select: { id: true } });
      targets = active.map((a) => a.id);
    }
    for (const id of targets) sent += await pushToStaff(id, { title: `Reminder: ${r.title}`, body: r.note || "It is time.", href: "/reminders", tag: `reminder-${r.id}`, urgent: true });
    await prisma.reminder.update({ where: { id: r.id }, data: { lastNotifiedAt: now } });
  }
  return sent;
}
