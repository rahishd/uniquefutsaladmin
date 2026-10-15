import { prisma } from "../db";

// Unique Club (the customer app sells it: Rs. 1,500 for 30 days). A member gets 10% off court bookings, Gamezone and
// hosted tournaments, and no promo or VIP code on top. The member list lives in the shared database (ClubMember).
export const CLUB_PERCENT = 10;
export const clubDiscountOf = (amount: number) => Math.round((amount * CLUB_PERCENT) / 100);

// Membership-plan and tournament-hosting discounts: a member who is 15 days in, or has played 5 games since joining.
export const MATURE_DAYS = 15;
export const MATURE_GAMES = 5;

/** True when the customer is a club member at that moment AND mature (15 days in the club, or 5 games played since joining). */
export async function clubMature(phone?: string | null, at: Date = new Date()): Promise<boolean> {
  if (!phone) return false;
  const m = await prisma.clubMember.findUnique({ where: { userId: phone }, select: { validUntil: true, startedAt: true } });
  if (!m || m.validUntil.getTime() <= at.getTime()) return false;
  if (at.getTime() - m.startedAt.getTime() >= MATURE_DAYS * 86_400_000) return true;
  const games = await prisma.booking.count({ where: { userId: phone, status: "completed", date: { gte: m.startedAt.toISOString().slice(0, 10) } } });
  return games >= MATURE_GAMES;
}

/** True when the customer (a registered mobile number) is a club member at that moment. */
export async function clubActive(phone?: string | null, at: Date = new Date()): Promise<boolean> {
  if (!phone) return false;
  const m = await prisma.clubMember.findUnique({ where: { userId: phone }, select: { validUntil: true } });
  return !!m && m.validUntil.getTime() > at.getTime();
}
