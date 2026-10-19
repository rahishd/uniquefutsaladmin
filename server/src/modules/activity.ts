// Live feed for the admin bell: what customers just did in the app (new bookings, payments, cancellations, complaints, referrals,
// academy sign-ups, challenges and scores, Gamezone, membership requests, "I'm coming", new sign-ups). It reads the same tables the
// customer app writes, so there is nothing to sync. Each staff member only sees the kinds they may open.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const activityRouter = Router();

// ref names the record (the same key the page puts in data-hl), so a click can highlight it
export type Item = { id: string; type: string; title: string; text: string; href: string; at: string; ref?: string };
const NEEDS: Record<string, string> = {
  booking: "bookings.view", payment: "payments.view", customer: "customers.view", complaint: "complaints.view", referral: "refer.view", academy: "academy.view",
  wheelchair: "wheelchair.view", insurance: "insurance.view", challenge: "teams.view", result: "teams.view", gamezone: "gamezone.view", membership: "membership.view", arrival: "arrivals.view",
};
// audit-log entities that have a page, the key their rows carry, and actions too routine to announce
const STAFF: Record<string, { type: string; href: string; prefix: string; label: string }> = {
  booking: { type: "booking", href: "/bookings", prefix: "b-", label: "booking" },
  gamezone: { type: "gamezone", href: "/gamezone", prefix: "g-", label: "Gamezone session" },
  membership: { type: "membership", href: "/membership", prefix: "m-", label: "membership" },
  payment: { type: "payment", href: "/payments", prefix: "pay-", label: "payment" },
  customer: { type: "customer", href: "/customers", prefix: "u-", label: "customer" },
  complaint: { type: "complaint", href: "/complaints", prefix: "c-", label: "complaint" },
  referral: { type: "referral", href: "/refer", prefix: "r-", label: "referral" },
  wheelchair: { type: "wheelchair", href: "/wheelchair", prefix: "wc-", label: "wheelchair request" },
  insurance: { type: "insurance", href: "/insurance", prefix: "ic-", label: "insurance claim" },
};
const QUIET = ["digitalid-card", "digitalid-scan", "player-stats"];
const h12 = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const hour = (n: number) => `${n % 12 || 12}:00 ${n < 12 ? "AM" : "PM"}`;
const NOT_LEDGER = { AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }, { paymentMethod: { not: "membership" } }] };

// The feed for one staff member (what they may open, without their own actions). Also used to push new items while the portal is closed.
export async function buildActivity(staff: { id: string; permissions: string[] }, since: Date): Promise<Item[]> {
  const can = new Set(staff.permissions);
  const want = (t: string) => can.has(NEEDS[t]);
  const gte = { gte: since };
  const take = 25;

  const [bookings, cancelled, orders, users, complaints, referrals, academy, challenges, results, gz, subs, arrivals] = await Promise.all([
    want("booking") ? prisma.booking.findMany({ where: { createdAt: gte, source: { not: "challenge" }, AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "WALK_IN" } } }] }, ...NOT_LEDGER.AND] }, orderBy: { createdAt: "desc" }, take }) : [],
    want("booking") ? prisma.booking.findMany({ where: { updatedAt: gte, status: "cancelled", ...NOT_LEDGER }, orderBy: { updatedAt: "desc" }, take }) : [],
    want("payment") ? prisma.paymentOrder.findMany({ where: { paidAt: gte, status: "paid", paidBy: null }, orderBy: { paidAt: "desc" }, take }) : [],
    want("customer") ? prisma.user.findMany({ where: { createdAt: gte, role: "user" }, orderBy: { createdAt: "desc" }, take, select: { phoneNumber: true, name: true, createdAt: true } }) : [],
    want("complaint") ? prisma.complaint.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [],
    want("referral") ? prisma.referral.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [],
    want("academy") ? prisma.academyEnrollment.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [],
    want("challenge") ? prisma.challenge.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [],
    want("result") ? prisma.challengeResult.findMany({ where: { createdAt: gte }, include: { challenge: true }, orderBy: { createdAt: "desc" }, take }) : [],
    want("gamezone") ? prisma.gzBooking.findMany({ where: { createdAt: gte, paymentStatus: { not: "expired" } }, orderBy: { createdAt: "desc" }, take }) : [],
    want("membership") ? prisma.membershipSubscription.findMany({ where: { createdAt: gte, status: "pending" }, include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take }) : [],
    want("arrival") ? prisma.arrivalCheckin.findMany({ where: { confirmedAt: gte }, orderBy: { confirmedAt: "desc" }, take }) : [],
  ]);

  const wheels = want("wheelchair") ? await prisma.wheelchairRequest.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [];
  const claims = want("insurance") ? await prisma.insuranceClaim.findMany({ where: { createdAt: gte }, orderBy: { createdAt: "desc" }, take }) : [];
  const ids = new Set<string>();
  for (const c of claims) ids.add(c.userId);
  for (const w of wheels) ids.add(w.userId);
  for (const b of [...bookings, ...cancelled]) if (b.userId) ids.add(b.userId);
  for (const x of [...orders, ...complaints, ...gz, ...arrivals, ...subs, ...academy]) if (x.userId) ids.add(x.userId);
  for (const r of referrals) ids.add(r.referrerId);
  const names = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: [...ids] } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const who = (id: string | null | undefined, fallback = "A customer") => (id && names.get(id)) || id || fallback;
  const teamNames = new Map((await prisma.team.findMany({ where: { id: { in: [...challenges.flatMap((c) => [c.challengerTeamId, c.challengedTeamId]), ...results.map((r) => r.submittedByTeamId)] } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));

  const staffLog = await prisma.adminAuditLog.findMany({
    where: { createdAt: gte, staffId: { not: staff.id }, entity: { in: Object.keys(STAFF).filter((e) => want(STAFF[e].type)) }, action: { notIn: QUIET } },
    orderBy: { createdAt: "desc" }, take,
  });
  const bookingIds = staffLog.filter((l) => l.entity === "booking" && l.entityId).map((l) => l.entityId!);
  const bookingDay = new Map((bookingIds.length ? await prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, date: true } }) : []).map((b) => [b.id, b.date]));
  const staffItems: Item[] = staffLog.map((l) => {
    const m = STAFF[l.entity];
    const date = l.entity === "booking" && l.entityId ? bookingDay.get(l.entityId) : undefined;
    return {
      id: `s-${l.id}`, type: m.type, title: `Staff: ${l.action.replace(/-/g, " ").replace(/^w/, (c) => c.toUpperCase())}`,
      text: `${l.staffName}, ${m.label}`, href: date ? `/slots?date=${date}` : m.href, ref: l.entityId ? `${m.prefix}${l.entityId}` : undefined, at: l.createdAt.toISOString(),
    };
  });

  const items: Item[] = [
    ...staffItems,
    ...claims.map((c) => ({ id: `ic-${c.id}`, ref: `ic-${c.id}`, type: "insurance", title: c.severity === "emergency" ? "Insurance claim: EMERGENCY" : "Insurance claim", text: `${c.patientName} (${c.patientPhone}), injury on ${day(c.incidentDate)}, filed by ${who(c.userId)}`, href: "/insurance", at: c.createdAt.toISOString() })),
    ...wheels.map((w) => ({ id: `wc-${w.id}`, ref: `wc-${w.id}`, type: "wheelchair", title: "Wheelchair request", text: `${who(w.userId)}, ${day(w.date)} about ${h12(w.time)}${w.people > 1 ? `, ${w.people} wheelchair users` : ""}`, href: "/wheelchair", at: w.createdAt.toISOString() })),
    ...bookings.map((b) => ({ id: `b-${b.id}`, ref: `b-${b.id}`, type: "booking", title: "New booking", text: `${b.customerName ?? who(b.userId)}, ${day(b.date)} ${h12(b.startTime)}${b.status === "pending" ? " (waiting for payment)" : ""}`, href: `/slots?date=${b.date}`, at: b.createdAt.toISOString() })),
    ...cancelled.map((b) => ({ id: `bc-${b.id}-${b.updatedAt.getTime()}`, ref: `b-${b.id}`, type: "booking", title: "Booking cancelled", text: `${b.customerName ?? who(b.userId)}, ${day(b.date)} ${h12(b.startTime)}`, href: "/bookings", at: b.updatedAt.toISOString() })),
    ...orders.map((o) => ({ id: `p-${o.id}`, ref: `pay-${o.orderCode}`, type: "payment", title: "Payment received", text: `Rs. ${o.amount} by ${o.method} from ${who(o.userId, o.guestPhone ?? "a guest")} (${o.orderCode})`, href: "/payments", at: o.paidAt!.toISOString() })),
    ...users.map((u) => ({ id: `u-${u.phoneNumber}`, ref: `u-${u.phoneNumber}`, type: "customer", title: "New customer", text: `${u.name ?? "Someone"} signed up (${u.phoneNumber})`, href: "/customers", at: u.createdAt.toISOString() })),
    ...complaints.map((c) => ({ id: `c-${c.id}`, ref: `c-${c.id}`, type: "complaint", title: "New complaint", text: `${who(c.userId)}: ${c.category}`, href: "/complaints", at: c.createdAt.toISOString() })),
    ...referrals.map((r) => ({ id: `r-${r.id}`, ref: `r-${r.id}`, type: "referral", title: "Referral to review", text: `${who(r.referrerId)} referred ${r.teamName}`, href: "/refer", at: r.createdAt.toISOString() })),
    ...academy.map((a) => ({ id: `a-${a.id}`, ref: `a-${a.id}`, type: "academy", title: "Academy sign-up", text: `${a.childName}, guardian ${a.guardianName}`, href: "/academy?tab=children", at: a.createdAt.toISOString() })),
    ...challenges.map((c) => ({ id: `ch-${c.id}`, ref: `ch-${c.id}`, type: "challenge", title: "New challenge", text: `${teamNames.get(c.challengerTeamId) ?? "A team"} challenged ${teamNames.get(c.challengedTeamId) ?? "a team"}, ${day(c.date)} ${hour(c.startHour)}`, href: "/teams?tab=challenges", at: c.createdAt.toISOString() })),
    ...results.map((r) => ({ id: `rs-${r.id}`, ref: `rs-${r.id}`, type: "result", title: r.status === "disputed" ? "Score disputed" : "Score uploaded", text: `${teamNames.get(r.submittedByTeamId) ?? "A team"} ${r.scoreSubmitter}-${r.scoreOther}`, href: r.status === "disputed" ? "/disputes" : "/teams?tab=challenges", at: r.createdAt.toISOString() })),
    ...gz.map((g) => ({ id: `g-${g.id}`, ref: `g-${g.code}`, type: "gamezone", title: "Gamezone booking", text: `${g.userId ? who(g.userId) : g.guestName ?? "A guest"}, ${g.gameTitle}, ${day(g.date)} ${hour(g.startHour)}`, href: "/gamezone", at: g.createdAt.toISOString() })),
    ...subs.map((s) => ({ id: `m-${s.id}`, ref: `m-${s.id}`, type: "membership", title: "Membership request", text: `${who(s.userId)} asked for ${s.plan.name}${s.totalPrice ? ` (Rs. ${Math.round(s.totalPrice)})` : ""}`, href: "/membership", at: s.createdAt.toISOString() })),
    ...arrivals.map((a) => ({ id: `ar-${a.refId}-${a.confirmedAt.getTime()}`, ref: `ar-${a.refId}`, type: "arrival", title: "Customer is coming", text: `${who(a.userId)} confirmed they are on the way`, href: "/arrivals", at: a.confirmedAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  return items;
}

activityRouter.get("/activity", requirePermission("dashboard.view"), handler(async (req, res) => {
  const q = parse(z.object({ since: z.string().datetime().optional() }), req.query);
  const floor = new Date(Date.now() - 7 * 86_400_000);
  const since = q.since ? new Date(Math.max(new Date(q.since).getTime(), floor.getTime())) : new Date(Date.now() - 24 * 3_600_000);
  send(res, { items: await buildActivity(req.staff!, since), now: new Date().toISOString() });
}));
