// Complimentary mineral water for games staff book by hand (same rule as the customer app, backend/src/utils/water.ts):
// 2 bottles with a game, except for a VIP customer, and unless staff switch it off for this booking.
import { prisma } from "../db";

export const COMPLIMENTARY_WATER = 2;

export type WaterResult = { bottles: number; excluded: "vip" | "staff" | null };

export async function waterForBooking(customerPhone: string | undefined | null, wanted: boolean): Promise<WaterResult> {
  if (customerPhone && (await prisma.vipCode.findFirst({ where: { userId: customerPhone, active: true }, select: { id: true } }))) return { bottles: 0, excluded: "vip" };
  if (!wanted) return { bottles: 0, excluded: "staff" };
  return { bottles: COMPLIMENTARY_WATER, excluded: null };
}
