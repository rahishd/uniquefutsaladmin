// Effects on customer records that must follow the customer app's rules exactly
// (mirrors backend/src/utils/loyaltyPoints.ts and the notification table of the customer backend).
import { Prisma } from "@prisma/client";
import { prisma, Tx } from "../db";
import { addMonthsKey, todayKey } from "./dates";

export type LoyaltyKind = "game" | "captain_win" | "goods" | "membership" | "referral";

export const pointsForGame = (priceRs: number) => Math.floor(Math.max(0, priceRs) / 10) / 10; // price/100, 1 decimal
export const pointsForGoods = (amountRs: number) => Math.floor(Math.max(0, amountRs) / 100);
export const GZ_POINTS_PER_HOUR = 5; // Gamezone: every hour played earns 5 points

function expiryFor(kind: LoyaltyKind, earnedOn: string): string | null {
  if (kind === "game" || kind === "captain_win") return addMonthsKey(earnedOn, 3);
  if (kind === "goods" || kind === "referral") return addMonthsKey(earnedOn, 12);
  return null; // membership never expires
}

// In-app notice (the customer backend pushes to devices; this only writes the inbox row). Never throws.
export async function notify(db: Tx | typeof prisma, n: { userId: string; type: string; title: string; message: string; href?: string; dedupeKey?: string }) {
  try {
    const user = await db.user.findUnique({ where: { phoneNumber: n.userId }, select: { phoneNumber: true } });
    if (!user) return;
    if (n.dedupeKey && (await db.notification.findUnique({ where: { dedupeKey: n.dedupeKey } }))) return;
    await db.notification.create({ data: { userId: n.userId, type: n.type, title: n.title, message: n.message, href: n.href ?? null, dedupeKey: n.dedupeKey ?? null } });
  } catch {
    /* a failed notice must never break a booking or payment */
  }
}

// Adds points once per (kind, source type, source id). Calling again for the same source changes nothing.
export async function awardPoints(p: { userId: string; kind: LoyaltyKind; points: number; sourceType: string; sourceId: string; detail: string; earnedOn?: string }): Promise<boolean> {
  if (p.points <= 0) return false;
  const earnedOn = p.earnedOn ?? todayKey();
  try {
    await prisma.loyaltyEntry.create({
      data: {
        userId: p.userId, kind: p.kind, points: new Prisma.Decimal(p.points.toFixed(1)), earnedOn,
        expiresOn: expiryFor(p.kind, earnedOn), sourceType: p.sourceType, sourceId: p.sourceId, detail: p.detail,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  await notify(prisma, { userId: p.userId, type: "points", title: "Points earned", message: `+${p.points} loyalty points: ${p.detail}`, href: "/points", dedupeKey: `points-${p.kind}-${p.sourceType}-${p.sourceId}` });
  return true;
}

// A completed, paid regular game earns price/100 points. Guests, free-game, membership and challenge bookings earn none.
export async function awardForCompletedBooking(b: { id: string; userId: string | null; totalPrice: number; paymentStatus: string; notes: string | null; voucherId: string | null; date: string; startTime: string; source: string }) {
  if (!b.userId || b.paymentStatus !== "completed") return false;
  if (b.notes?.includes("FREE_MATCH") || b.voucherId || b.notes?.includes("MEMBERSHIP_") || b.source === "challenge") return false;
  const pts = pointsForGame(b.totalPrice);
  return awardPoints({ userId: b.userId, kind: "game", points: pts, sourceType: "booking", sourceId: b.id, detail: `Game on ${b.date} at ${b.startTime} (Rs. ${b.totalPrice})`, earnedOn: b.date });
}

// A completed, paid Gamezone session earns 5 points per hour played (a 2 hour session = 10). Guests earn nothing.
// Called whenever a session becomes completed or paid, so it fires once both are true; the source key makes it once only.
export async function awardForGamezone(b: { code: string; userId: string | null; hours: number; status: string; paymentStatus: string; date: string }) {
  if (!b.userId || b.status !== "completed" || b.paymentStatus !== "paid") return false;
  return awardPoints({
    userId: b.userId, kind: "game", points: b.hours * GZ_POINTS_PER_HOUR, sourceType: "gamezone", sourceId: b.code,
    detail: `Gamezone ${b.hours} ${b.hours === 1 ? "hour" : "hours"} on ${b.date}`, earnedOn: b.date,
  });
}
