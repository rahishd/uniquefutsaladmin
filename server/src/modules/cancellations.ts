// Customer cancellations: how many games in a row a customer has cancelled, and the record of each one.
// Only cancellations the CUSTOMER made count: ones staff made (audited as "cancel" by a staff member) and unpaid QR holds that
// simply expired are left out, so staff are never told a customer is unreliable because of something the venue did.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

type Ev = { uid: string; ref: string; status: string; createdAt: Date };
const WINDOW = 15; // the most recent bookings looked at per customer
const NEPAL = "+05:45";

async function staffCancelled(refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const rows = await prisma.adminAuditLog.findMany({ where: { action: "cancel", entity: { in: ["booking", "gamezone"] }, entityId: { in: refs } }, select: { entityId: true } });
  return new Set(rows.map((r) => r.entityId as string));
}

// Cancelled-in-a-row for each phone: the newest bookings (court and Gamezone together), counted until the first one that was not cancelled.
export async function cancellationStreaks(phones: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (phones.length === 0) return out;
  const list = Prisma.join(phones);
  const [court, gz] = await Promise.all([
    prisma.$queryRaw<Ev[]>(Prisma.sql`
      SELECT "userId" AS uid, id AS ref, status, "createdAt" FROM (
        SELECT b."userId", b.id, b.status, b."createdAt", ROW_NUMBER() OVER (PARTITION BY b."userId" ORDER BY b."createdAt" DESC) AS rn
        FROM "Booking" b
        WHERE b."userId" IN (${list}) AND b."paymentMethod" <> 'membership' AND (b.notes IS NULL OR b.notes NOT LIKE '%MEMBERSHIP_PAYMENT%')
      ) t WHERE rn <= ${WINDOW}`),
    prisma.$queryRaw<Ev[]>(Prisma.sql`
      SELECT "userId" AS uid, code AS ref, status, "createdAt" FROM (
        SELECT g."userId", g.code, g.status, g."createdAt", ROW_NUMBER() OVER (PARTITION BY g."userId" ORDER BY g."createdAt" DESC) AS rn
        FROM "GzBooking" g WHERE g."userId" IN (${list})
      ) t WHERE rn <= ${WINDOW}`),
  ]);
  const all = [...court, ...gz];
  const byStaff = await staffCancelled(all.filter((e) => e.status === "cancelled").map((e) => e.ref));
  const perUser = new Map<string, Ev[]>();
  for (const e of all) {
    if (e.status === "expired" || (e.status === "cancelled" && byStaff.has(e.ref))) continue;
    perUser.set(e.uid, [...(perUser.get(e.uid) ?? []), e]);
  }
  for (const [uid, evs] of perUser) {
    evs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    let n = 0;
    while (n < evs.length && evs[n].status === "cancelled") n++;
    out.set(uid, n);
  }
  return out;
}

export type CancelRecord = { kind: "court" | "gamezone"; code: string; date: string; time: string; amount: number; cancelledAt: string | null; hoursBefore: number | null; wasPaid: boolean };

// The full record for one customer's profile.
export async function cancellationProfile(phone: string) {
  const [court, gz] = await Promise.all([
    prisma.booking.findMany({
      where: { AND: [{ userId: phone, status: "cancelled" }, { paymentMethod: { not: "membership" } }, { OR: [{ notes: null }, { notes: { not: { contains: "MEMBERSHIP_PAYMENT" } } }] }] },
      orderBy: { createdAt: "desc" }, take: 200,
    }),
    prisma.gzBooking.findMany({ where: { userId: phone, status: "cancelled" }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const byStaff = await staffCancelled([...court.map((b) => b.id), ...gz.map((g) => g.code)]);
  const hours = (date: string, time: string, at: Date | null) => (at ? Math.max(0, Math.round(((new Date(`${date}T${time}:00${NEPAL}`).getTime() - at.getTime()) / 3600000) * 10) / 10) : null);
  const records: (CancelRecord & { sort: number })[] = [
    ...court.filter((b) => !byStaff.has(b.id)).map((b) => ({ kind: "court" as const, code: b.code ?? "UF-" + b.id.slice(-6).toUpperCase(), date: b.date, time: b.startTime, amount: b.totalPrice, cancelledAt: b.cancelledAt?.toISOString() ?? null, hoursBefore: hours(b.date, b.startTime, b.cancelledAt), wasPaid: b.paymentStatus === "completed", sort: (b.cancelledAt ?? b.createdAt).getTime() })),
    ...gz.filter((g) => !byStaff.has(g.code)).map((g) => ({ kind: "gamezone" as const, code: g.code, date: g.date, time: `${String(g.startHour).padStart(2, "0")}:00`, amount: g.total, cancelledAt: null, hoursBefore: null, wasPaid: g.paymentStatus === "refunded", sort: g.createdAt.getTime() })),
  ].sort((a, b) => b.sort - a.sort);
  const monthAgo = Date.now() - 30 * 86400000;
  const streak = (await cancellationStreaks([phone])).get(phone) ?? 0;
  return {
    streak,
    total: records.length,
    last30: records.filter((r) => r.sort >= monthAgo).length,
    lateCount: records.filter((r) => r.hoursBefore !== null && r.hoursBefore < 2).length,
    recent: records.slice(0, 10).map(({ sort: _sort, ...r }) => r),
  };
}
