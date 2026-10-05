import { api } from "./api";

export type Pricing = { hourlyRate: number; hourlyPricing: { id: string; time: string; price: number }[] };
export type Block = { id: string; date: string; hour: number; reason: string; createdAt: string };

export const getPricing = () => api<Pricing>("/admin/courts/pricing");
export const savePricing = (body: { hourlyRate?: number; hours?: { hour: number; price: number }[] }) =>
  api<Pricing>("/admin/courts/pricing", { method: "PUT", body: JSON.stringify(body) });

export const getBlocks = () => api<Block[]>("/admin/courts/blocks");
export const addBlock = (b: { date: string; hours: number[]; reason: string }) => api<Block[]>("/admin/courts/blocks", { method: "POST", body: JSON.stringify(b) });
export const removeBlock = (id: string) => api(`/admin/courts/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });

// The hours the venue is open (5 AM to 10 PM) and the three price shifts the customer app uses.
export const HOURS = Array.from({ length: 17 }, (_, i) => i + 5);
export const SHIFTS = [
  { id: "Morning", label: "Morning", range: "5 AM – 10 AM", hours: HOURS.filter((h) => h < 10) },
  { id: "Day", label: "Day", range: "10 AM – 5 PM", hours: HOURS.filter((h) => h >= 10 && h < 17) },
  { id: "Evening", label: "Evening", range: "5 PM – 10 PM", hours: HOURS.filter((h) => h >= 17) },
];

export const priceMap = (p: Pricing): Record<number, number> => {
  const m: Record<number, number> = {};
  for (const h of HOURS) m[h] = p.hourlyRate;
  for (const x of p.hourlyPricing) m[Number(x.id.replace("ts-", ""))] = x.price;
  return m;
};
