// The customer app reads prices and promo codes from the Settings table (JSON strings). Same keys here.
import { prisma } from "../db";

export type HourPrice = { id: string; time: string; price: number }; // id "ts-<hour>"
export type PromoCode = {
  code: string; type: "percent" | "flat"; value: number; label: string; title?: string; description?: string;
  expiryDate?: string; startTime?: string; endTime?: string; validDays?: string[]; isActive?: boolean; appliedTo: "booking" | "membership" | "both";
  maxUses?: number; maxPerCustomer?: number;
  includesWater?: boolean; // a game booked with this code still includes the 2 complimentary mineral water bottles (default off)
};

export async function getSetting(key: string): Promise<string | null> {
  return (await prisma.settings.findUnique({ where: { key } }))?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await prisma.settings.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const v = await getSetting(key);
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

export const getHourlyRate = async () => Number((await getSetting("hourlyRate")) ?? 0) || 0;
export const getHourlyPricing = () => getJson<HourPrice[]>("hourlyPricing", []);
export const getPromoCodes = () => getJson<PromoCode[]>("promoCodes", []);

export async function getHourPrice(hour: number): Promise<number> {
  const pricing = await getHourlyPricing();
  return pricing.find((p) => Number(p.id.replace("ts-", "")) === hour)?.price ?? (await getHourlyRate());
}
