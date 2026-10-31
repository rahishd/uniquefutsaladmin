// Effects on customer records that must follow the customer app's rules exactly
// (mirrors backend/src/utils/loyaltyPoints.ts and the notification table of the customer backend).
import { Prisma } from "@prisma/client";
import { prisma, Tx } from "../db";
import { addMonthsKey, todayKey } from "./dates";

export type LoyaltyKind = "game" | "captain_win" | "goods" | "membership" | "referral" | "goal_rush" | "gift";

// Court and add-on items: every Rs. 100 of the bill = 1 point, cut to one decimal (court Rs. 1,000 = 10 points, items Rs. 550 = 5.5).
export const pointsForGame = (priceRs: number) => Math.floor(Math.max(0, priceRs) / 10) / 10;
export const pointsForGoods = (amountRs: number) => Math.floor(Math.max(0, amountRs) / 10) / 10;
// Items count only up to Rs. 1,000 a day per customer: at most 10 points a day, however much is bought.
export const GOODS_DAILY_MAX_POINTS = 10;
export const GZ_POINTS_PER_HOUR = 5; // Gamezone: every hour played earns 5 points

function expiryFor(kind: LoyaltyKind, earnedOn: string): string | null {
  if (kind === "game" || kind === "captain_win" || kind === "goal_rush") return addMonthsKey(earnedOn, 3);
  if (kind === "goods" || kind === "referral" || kind === "gift") return addMonthsKey(earnedOn, 12);
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

// Where a points notice opens: the Points page with this ledger row highlighted (?hl=<row id>).
export async function pointsHref(userId: string, sourceType: string, sourceId: string): Promise<string> {
  const e = await prisma.loyaltyEntry.findFirst({ where: { userId, sourceType, sourceId }, select: { id: true } });
  return e ? `/points?hl=${e.id}` : "/points";
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
  await notify(prisma, { userId: p.userId, type: "points", title: "Points earned", message: `+${p.points} loyalty points: ${p.detail}`, href: await pointsHref(p.userId, p.sourceType, p.sourceId), dedupeKey: `points-${p.kind}-${p.sourceType}-${p.sourceId}` });
  return true;
}

// Points for goods (add-on items) paid by a customer, within the daily limit. Returns the points actually given (0 when none).
// A sale already counted gives nothing again. Several sales in one day share the limit.
export async function awardGoodsPoints(p: { userId: string; amountRs: number; sourceId: string; detail: string; earnedOn?: string }): Promise<number> {
  const want = pointsForGoods(p.amountRs);
  if (want <= 0) return 0;
  const earnedOn = p.earnedOn ?? todayKey();
  if (await prisma.loyaltyEntry.findFirst({ where: { userId: p.userId, kind: "goods", sourceType: "goods", sourceId: p.sourceId }, select: { id: true } })) return 0;
  const today = await prisma.loyaltyEntry.findMany({ where: { userId: p.userId, kind: "goods", earnedOn, points: { gt: 0 } }, select: { points: true } });
  const already = today.reduce((n, e) => n + Number(e.points), 0);
  const room = Math.max(0, Math.round((GOODS_DAILY_MAX_POINTS - already) * 10) / 10);
  const pts = Math.min(want, room);
  if (pts <= 0) return 0;
  const detail = pts < want ? `${p.detail} (items earn at most ${GOODS_DAILY_MAX_POINTS} points a day)` : p.detail;
  return (await awardPoints({ userId: p.userId, kind: "goods", points: pts, sourceType: "goods", sourceId: p.sourceId, detail, earnedOn })) ? pts : 0;
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
