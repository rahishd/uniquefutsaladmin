// A membership holds one hour of the day on chosen weekdays for the whole period (the customer app already blocks it for other customers).
// The admin side uses the same rule so staff cannot book or sell that hour to someone else by accident.
import { prisma } from "../db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const weekdayOf = (dateKey: string): string => WEEKDAYS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
export const keyOf = (d: Date): string => d.toISOString().slice(0, 10);

export type Hold = { date: string; hour: number; userId: string; name: string | null; memberCode: string | null };

type Sub = { timeSlot: string | null; chosenDays: string[]; excludeDays: string[]; startDate: Date; endDate: Date };
export const holds = (s: Sub, date: string, hour: number): boolean => {
  if (!s.timeSlot || Number(s.timeSlot.slice(0, 2)) !== hour) return false;
  if (date < keyOf(s.startDate) || date > keyOf(s.endDate)) return false;
  const day = weekdayOf(date);
  if (s.excludeDays.includes(day)) return false;
  return s.chosenDays.length === 0 || s.chosenDays.includes(day); // no chosen days means every day
};

// Which of these dates and hours are held by someone's active or pending membership (leave out `exceptUserId`, the member themselves)?
export async function memberHolds(dates: string[], hours: number[], exceptUserId?: string | null): Promise<Hold[]> {
  if (dates.length === 0 || hours.length === 0) return [];
  const sorted = [...dates].sort();
  const subs = await prisma.membershipSubscription.findMany({
    where: {
      status: { in: ["active", "pending"] }, timeSlot: { not: null },
      startDate: { lte: new Date(`${sorted[sorted.length - 1]}T23:59:59.999Z`) }, endDate: { gte: new Date(`${sorted[0]}T00:00:00Z`) },
      ...(exceptUserId ? { userId: { not: exceptUserId } } : {}),
    },
    include: { user: { select: { name: true } } },
  });
  const out: Hold[] = [];
  for (const date of dates) for (const hour of hours) {
    const s = subs.find((x) => holds(x, date, hour));
    if (s) out.push({ date, hour, userId: s.userId, name: s.user.name, memberCode: s.memberCode });
  }
  return out;
}
