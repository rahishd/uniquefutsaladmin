// Live feed for the admin bell: what customers just did in the app (new bookings, payments, cancellations, complaints, referrals,
// academy sign-ups, challenges and scores, Gamezone, membership requests, "I'm coming", new sign-ups). It reads the same tables the
// customer app writes, so there is nothing to sync. Each staff member only sees the kinds they may open.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { handler, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const activityRouter = Router();

type Item = { id: string; type: string; title: string; text: string; href: string; at: string };
const NEEDS: Record<string, string> = {
  booking: "bookings.view", payment: "payments.view", customer: "customers.view", complaint: "complaints.view", referral: "refer.view", academy: "academy.view",
  challenge: "teams.view", result: "teams.view", gamezone: "gamezone.view", membership: "membership.view", arrival: "arrivals.view",
};
const h12 = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2, 5)} ${h < 12 ? "AM" : "PM"}`; };
const day = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const hour = (n: number) => `${n % 12 || 12}:00 ${n < 12 ? "AM" : "PM"}`;
const NOT_LEDGER = { AND: [{ OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }, { paymentMethod: { not: "membership" } }] };

activityRouter.get("/activity", requirePermission("dashboard.view"), handler(async (req, res) => {
  const q = parse(z.object({ since: z.string().datetime().optional() }), req.query);
  const floor = new Date(Date.now() - 7 * 86_400_000);
  const since = q.since ? new Date(Math.max(new Date(q.since).getTime(), floor.getTime())) : new Date(Date.now() - 24 * 3_600_000);
  const can = new Set(req.staff!.permissions as string[]);
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

  const ids = new Set<string>();
  for (const b of [...bookings, ...cancelled]) if (b.userId) ids.add(b.userId);
  for (const x of [...orders, ...complaints, ...gz, ...arrivals, ...subs, ...academy]) if (x.userId) ids.add(x.userId);
  for (const r of referrals) ids.add(r.referrerId);
  const names = new Map((await prisma.user.findMany({ where: { phoneNumber: { in: [...ids] } }, select: { phoneNumber: true, name: true } })).map((u) => [u.phoneNumber, u.name]));
  const who = (id: string | null | undefined, fallback = "A customer") => (id && names.get(id)) || id || fallback;
  const teamNames = new Map((await prisma.team.findMany({ where: { id: { in: [...challenges.flatMap((c) => [c.challengerTeamId, c.challengedTeamId]), ...results.map((r) => r.submittedByTeamId)] } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));

  const items: Item[] = [
    ...bookings.map((b) => ({ id: `b-${b.id}`, type: "booking", title: "New booking", text: `${b.customerName ?? who(b.userId)}, ${day(b.date)} ${h12(b.startTime)}${b.status === "pending" ? " (waiting for payment)" : ""}`, href: "/bookings", at: b.createdAt.toISOString() })),
    ...cancelled.map((b) => ({ id: `bc-${b.id}-${b.updatedAt.getTime()}`, type: "booking", title: "Booking cancelled", text: `${b.customerName ?? who(b.userId)}, ${day(b.date)} ${h12(b.startTime)}`, href: "/bookings", at: b.updatedAt.toISOString() })),
    ...orders.map((o) => ({ id: `p-${o.id}`, type: "payment", title: "Payment received", text: `Rs. ${o.amount} by ${o.method} from ${who(o.userId, o.guestPhone ?? "a guest")} (${o.orderCode})`, href: "/payments", at: o.paidAt!.toISOString() })),
    ...users.map((u) => ({ id: `u-${u.phoneNumber}`, type: "customer", title: "New customer", text: `${u.name ?? "Someone"} signed up (${u.phoneNumber})`, href: "/customers", at: u.createdAt.toISOString() })),
    ...complaints.map((c) => ({ id: `c-${c.id}`, type: "complaint", title: "New complaint", text: `${who(c.userId)}: ${c.category}`, href: "/complaints", at: c.createdAt.toISOString() })),
    ...referrals.map((r) => ({ id: `r-${r.id}`, type: "referral", title: "Referral to review", text: `${who(r.referrerId)} referred ${r.teamName}`, href: "/refer", at: r.createdAt.toISOString() })),
    ...academy.map((a) => ({ id: `a-${a.id}`, type: "academy", title: "Academy sign-up", text: `${a.childName}, guardian ${a.guardianName}`, href: "/academy", at: a.createdAt.toISOString() })),
    ...challenges.map((c) => ({ id: `ch-${c.id}`, type: "challenge", title: "New challenge", text: `${teamNames.get(c.challengerTeamId) ?? "A team"} challenged ${teamNames.get(c.challengedTeamId) ?? "a team"}, ${day(c.date)} ${hour(c.startHour)}`, href: "/teams", at: c.createdAt.toISOString() })),
    ...results.map((r) => ({ id: `rs-${r.id}`, type: "result", title: r.status === "disputed" ? "Score disputed" : "Score uploaded", text: `${teamNames.get(r.submittedByTeamId) ?? "A team"} ${r.scoreSubmitter}-${r.scoreOther}`, href: r.status === "disputed" ? "/disputes" : "/teams", at: r.createdAt.toISOString() })),
    ...gz.map((g) => ({ id: `g-${g.id}`, type: "gamezone", title: "Gamezone booking", text: `${g.userId ? who(g.userId) : g.guestName ?? "A guest"}, ${g.gameTitle}, ${day(g.date)} ${hour(g.startHour)}`, href: "/gamezone", at: g.createdAt.toISOString() })),
    ...subs.map((s) => ({ id: `m-${s.id}`, type: "membership", title: "Membership request", text: `${who(s.userId)} asked for ${s.plan.name}${s.totalPrice ? ` (Rs. ${Math.round(s.totalPrice)})` : ""}`, href: "/membership", at: s.createdAt.toISOString() })),
    ...arrivals.map((a) => ({ id: `ar-${a.refId}-${a.confirmedAt.getTime()}`, type: "arrival", title: "Customer is coming", text: `${who(a.userId)} confirmed they are on the way`, href: "/arrivals", at: a.confirmedAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

  send(res, { items, now: new Date().toISOString() });
}));
