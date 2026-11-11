import { randomBytes } from "crypto";
import ExcelJS from "exceljs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../lib/audit";
import { notify } from "../lib/customer-effects";
import { Actor, addGoal, goalBody, loadSheet, record, removeGoal, saveStructure, setStatus, statusBody, structureBody } from "../lib/tiesheet";

// Tournament page: the list, one tournament's tie-sheet with live scores and goals, and the private link a match-day host uses.
// The host link itself (no staff sign-in) is in tournament-host.ts.
export const tournamentsRouter = Router();

const who = (req: Parameters<Parameters<typeof handler>[0]>[0]): Actor => ({ id: req.staff!.id, name: req.staff!.name, ip: req.ip ?? null });
export const stateOf = (t: { status: string; startDate: string; endDate: string }) => (t.status === "completed" ? "completed" : t.startDate > todayKey() ? "upcoming" : "live");

// When a host link stops working by itself: a few days after the tournament ends (end of that day, Nepal time).
export const linkExpiry = (endDate: string) => new Date(`${addDaysKey(endDate, 3)}T23:59:59+05:45`);
const newToken = () => randomBytes(24).toString("base64url");

const linkView = (l: { token: string; active: boolean; expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date } | null) =>
  l ? { token: l.token, active: l.active, expired: !!l.expiresAt && l.expiresAt < new Date(), expiresAt: l.expiresAt, lastUsedAt: l.lastUsedAt, createdAt: l.createdAt } : null;

tournamentsRouter.get("/", requirePermission("tournaments.view"), handler(async (_req, res) => {
  const rows = await prisma.tournament.findMany({
    where: { status: { not: "cancelled" } },
    orderBy: [{ startDate: "desc" }],
    take: 100,
    include: { _count: { select: { registrations: true } } },
  });
  const rounds = await prisma.tournamentRound.findMany({ where: { tournamentId: { in: rows.map((t) => t.id) } }, select: { tournamentId: true, matches: { select: { status: true } } } });
  const sheet = new Map<string, { matches: number; live: number; finished: number }>();
  for (const r of rounds) {
    const s = sheet.get(r.tournamentId) ?? { matches: 0, live: 0, finished: 0 };
    for (const m of r.matches) { s.matches++; if (m.status === "live") s.live++; if (m.status === "finished") s.finished++; }
    sheet.set(r.tournamentId, s);
  }
  send(res, rows.map((t) => ({
    id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t), prizePool: t.prizePool, minTeams: t.minTeams, maxTeams: t.maxTeams,
    registrations: t._count.registrations, entryFee: t.entryFee, isActive: t.isActive, hostedEvent: t.hostedEvent, hostName: t.hostName, ...(sheet.get(t.id) ?? { matches: 0, live: 0, finished: 0 }),
  })));
}));

// Contacts as an Excel file: every registered captain (team, name, phone, status) and the host, each row with the event name, dates and
// playing hours. ?id= limits it to one tournament; with none it is every tournament. Staff who may also export customers get a second
// sheet with all customers (name and phone). Personal data: needs the registrations permission, and every export is in the audit log.
const hour12 = (h: number) => String(h % 24 % 12 || 12) + ":00 " + (h % 24 < 12 ? "AM" : "PM");
tournamentsRouter.get("/contacts-export", requirePermission("tournaments.registrations"), handler(async (req, res) => {
  const only = typeof req.query.id === "string" && req.query.id ? req.query.id : null;
  const list = await prisma.tournament.findMany({
    where: only ? { id: only } : {}, include: { days: { orderBy: { date: "asc" } }, registrations: { orderBy: { createdAt: "asc" } } }, orderBy: { startDate: "desc" },
  });
  if (only && list.length === 0) throw new AppError(404, "Tournament not found");
  const STATUS: Record<string, string> = { approved: "Registered", pending: "New", rejected: "Declined" };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Unique Futsal";
  const ws = wb.addWorksheet("Tournament contacts", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Event", key: "event", width: 30 }, { header: "Event dates", key: "dates", width: 26 }, { header: "Time", key: "time", width: 22 },
    { header: "Role", key: "role", width: 10 }, { header: "Team", key: "team", width: 26 }, { header: "Name", key: "name", width: 26 },
    { header: "Phone", key: "phone", width: 16 }, { header: "Status", key: "status", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  let rows = 0;
  for (const t of list) {
    const dates = t.startDate === t.endDate ? t.startDate : t.startDate + " to " + t.endDate;
    const spans = [...new Set(t.days.map((d) => hour12(d.startHour) + " to " + hour12(d.endHour)))].join(", ");
    const base = { event: t.name, dates, time: spans };
    if (t.hostedEvent && t.hostPhone) { ws.addRow({ ...base, role: "Host", team: "", name: t.hostName ?? "", phone: t.hostPhone, status: "" }); rows++; }
    for (const r of t.registrations) { ws.addRow({ ...base, role: "Captain", team: r.teamName, name: r.captainName, phone: r.contactPhone, status: STATUS[r.status] ?? r.status }); rows++; }
  }
  ws.getColumn("phone").numFmt = "@"; // text, so Excel never turns a number into 9.8E+09
  ws.autoFilter = { from: "A1", to: "H1" };

  let customers = 0;
  if (!only && req.staff!.permissions.includes("customers.export")) {
    const cs = wb.addWorksheet("All customers", { views: [{ state: "frozen", ySplit: 1 }] });
    cs.columns = [{ header: "Name", key: "name", width: 30 }, { header: "Phone", key: "phone", width: 16 }];
    cs.getRow(1).font = { bold: true };
    const users = await prisma.user.findMany({ where: { role: "user" }, select: { name: true, phoneNumber: true }, orderBy: [{ name: "asc" }, { createdAt: "asc" }], take: 50_000 });
    for (const u of users) cs.addRow({ name: u.name ?? "", phone: u.phoneNumber });
    cs.getColumn("phone").numFmt = "@";
    cs.autoFilter = { from: "A1", to: "B1" };
    customers = users.length;
  }
  await audit(req, "export", "tournament_contacts", only, { tournaments: list.length, rows, customers });
  const slug = only && list[0] ? list[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : "all-tournaments";
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="unique-futsal-contacts-' + slug + "-" + todayKey() + '.xlsx"',
    "Cache-Control": "no-store",
  });
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
}));

tournamentsRouter.get("/:id", requirePermission("tournaments.view"), handler(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { registrations: true } } } });
  if (!t) throw new AppError(404, "Tournament not found");
  const canShare = !!req.staff!.permissions.includes("tournaments.share");
  const link = canShare ? await prisma.tournamentHostLink.findUnique({ where: { tournamentId: t.id } }) : null;
  send(res, {
    tournament: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, state: stateOf(t), prizePool: t.prizePool, entryFee: t.entryFee, registrations: t._count.registrations, hostedEvent: t.hostedEvent, hostName: t.hostName },
    rounds: await loadSheet(t.id),
    hostLink: linkView(link),
    canShare,
  });
}));

// The entry fee customers see on the tournament page and on the registration page (rupees per team, 0 = free entry).
tournamentsRouter.patch("/:id/entry-fee", requirePermission("tournaments.edit"), handler(async (req, res) => {
  const b = parse(z.object({ entryFee: z.number().int("Whole rupees only").min(0, "The fee cannot be below 0").max(1_000_000, "That fee is too high") }), req.body);
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true, entryFee: true } });
  if (!t) throw new AppError(404, "Tournament not found");
  await prisma.tournament.update({ where: { id: t.id }, data: { entryFee: b.entryFee } });
  await audit(req, "entry-fee", "tournament", t.id, { tournament: t.name, from: t.entryFee, to: b.entryFee });
  send(res, { entryFee: b.entryFee }, "Entry fee saved");
}));

// ---- team registrations: teams that signed up from the shareable link on the customer site ----
const players = (raw: string): string[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const registrationView = (r: { id: string; teamName: string; captainName: string; contactPhone: string; contactEmail: string; players: string; status: string; createdAt: Date }) => ({
  id: r.id, teamName: r.teamName, captainName: r.captainName, contactPhone: r.contactPhone, contactEmail: r.contactEmail || null, players: players(r.players), status: r.status, createdAt: r.createdAt,
});

tournamentsRouter.get("/:id/registrations", requirePermission("tournaments.view"), handler(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") }, select: { id: true, maxTeams: true } });
  if (!t) throw new AppError(404, "Tournament not found");
  const rows = await prisma.registration.findMany({ where: { tournamentId: t.id }, orderBy: { createdAt: "asc" } });
  send(res, { maxTeams: t.maxTeams, items: rows.map(registrationView) });
}));

tournamentsRouter.patch("/:id/registrations/:rid", requirePermission("tournaments.registrations"), handler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(["pending", "approved", "rejected"]) }), req.body);
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true, maxTeams: true } });
  if (!t) throw new AppError(404, "Tournament not found");
  const r = await prisma.registration.findFirst({ where: { id: param(req, "rid"), tournamentId: t.id } });
  if (!r) throw new AppError(404, "Registration not found");
  if (r.status === b.status) return send(res, registrationView(r), "Saved");
  // bringing a rejected team back needs a free place
  if (r.status === "rejected" && t.maxTeams > 0) {
    const taken = await prisma.registration.count({ where: { tournamentId: t.id, status: { not: "rejected" } } });
    if (taken >= t.maxTeams) throw new AppError(409, "All team places are taken. Reject another team first.");
  }
  const upd = await prisma.registration.update({ where: { id: r.id }, data: { status: b.status } });
  await audit(req, b.status, "team-registration", r.id, { tournament: t.name, team: r.teamName });
  if (b.status === "approved" || b.status === "rejected") {
    await notify(prisma, {
      userId: r.contactPhone, type: "tournament", href: "/tournaments",
      title: b.status === "approved" ? "Your team is confirmed" : "Team registration not accepted",
      message: b.status === "approved" ? `${r.teamName} is confirmed for ${t.name}. See you there!` : `${r.teamName} could not be accepted for ${t.name}. Please call the venue if you have questions.`,
      dedupeKey: `reg-${r.id}-${b.status}`,
    });
  }
  send(res, registrationView(upd), b.status === "approved" ? "Team confirmed" : b.status === "rejected" ? "Team rejected" : "Saved");
}));

tournamentsRouter.put("/:id/tiesheet", requirePermission("tournaments.edit"), handler(async (req, res) => {
  const id = param(req, "id");
  await saveStructure(id, parse(structureBody, req.body), who(req));
  send(res, { rounds: await loadSheet(id) }, "Tie-sheet saved");
}));

tournamentsRouter.post("/matches/:id/goal", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await addGoal(param(req, "id"), parse(goalBody, req.body), who(req)), "Goal added", 201);
}));

tournamentsRouter.delete("/goals/:id", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await removeGoal(param(req, "id"), who(req)), "Goal removed");
}));

tournamentsRouter.post("/matches/:id/status", requirePermission("tournaments.edit"), handler(async (req, res) => {
  send(res, await setStatus(param(req, "id"), parse(statusBody, req.body), who(req)), "Match updated");
}));

// Create the link, or make a new one (the old one stops working at once).
tournamentsRouter.post("/:id/host-link", requirePermission("tournaments.share"), handler(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, "id") } });
  if (!t) throw new AppError(404, "Tournament not found");
  const data = { token: newToken(), active: true, expiresAt: linkExpiry(t.endDate), createdBy: req.staff!.name, lastUsedAt: null };
  const link = await prisma.tournamentHostLink.upsert({ where: { tournamentId: t.id }, create: { tournamentId: t.id, ...data }, update: data });
  await record(who(req), "host-link-create", t.id, { expiresAt: link.expiresAt });
  send(res, linkView(link), "Host link ready", 201);
}));

tournamentsRouter.delete("/:id/host-link", requirePermission("tournaments.share"), handler(async (req, res) => {
  const id = param(req, "id");
  await prisma.tournamentHostLink.updateMany({ where: { tournamentId: id }, data: { active: false } });
  await record(who(req), "host-link-revoke", id, {});
  send(res, null, "Host link switched off");
}));
