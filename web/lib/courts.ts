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

// ---------------- Gamezone ----------------
export type GzPlan = { players: number; label: string; ratePerPersonHour: number };
export type GzItem = { id: string; name: string; active: boolean };
export type GzCatalog = { plans: GzPlan[]; consoles: GzItem[]; games: GzItem[] };

// The customer app seeds these when no rates exist yet, so the page shows them until the first save.
export const DEFAULT_GZ_PLANS: GzPlan[] = [
  { players: 1, label: "Solo", ratePerPersonHour: 300 },
  { players: 2, label: "2 Players", ratePerPersonHour: 200 },
  { players: 4, label: "4 Players", ratePerPersonHour: 150 },
];

export async function getGzCatalog(): Promise<GzCatalog> {
  const c = await api<{ plans: GzPlan[]; consoles: { id: string; name: string; active: boolean }[]; games: { id: string; title: string; active: boolean }[] }>("/admin/gamezone/catalog");
  return { plans: c.plans, consoles: c.consoles, games: c.games.map((g) => ({ id: g.id, name: g.title, active: g.active })) };
}
export const saveGzPlan = (p: GzPlan) => api(`/admin/gamezone/plans/${p.players}`, { method: "PUT", body: JSON.stringify({ label: p.label, ratePerPersonHour: p.ratePerPersonHour }) });
export const addConsole = (name: string) => api("/admin/gamezone/consoles", { method: "POST", body: JSON.stringify({ name }) });
export const patchConsole = (id: string, b: { name?: string; active?: boolean }) => api(`/admin/gamezone/consoles/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const addGame = (title: string) => api("/admin/gamezone/games", { method: "POST", body: JSON.stringify({ title }) });
export const patchGame = (id: string, b: { name?: string; active?: boolean }) =>
  api(`/admin/gamezone/games/${id}`, { method: "PATCH", body: JSON.stringify({ ...(b.name !== undefined ? { title: b.name } : {}), ...(b.active !== undefined ? { active: b.active } : {}) }) });

// ---------------- Membership ----------------
export const M_SHIFTS = [
  { id: "morning", label: "Morning", hint: "before 12 PM" },
  { id: "day", label: "Day", hint: "12 PM – 4 PM" },
  { id: "evening", label: "Evening", hint: "from 8 PM" },
] as const;
export const M_LENGTHS = [
  { id: "1_month", label: "1 month" },
  { id: "3_months", label: "3 months" },
  { id: "6_months", label: "6 months" },
] as const;
export type MShift = (typeof M_SHIFTS)[number]["id"];
export type MLength = (typeof M_LENGTHS)[number]["id"];

export type MCell = { price: number | null; discount: number; customerPays: number | null };
export type MPlan = {
  id: string; name: string; description: string | null; perks: string[]; featured: boolean; isActive: boolean;
  matrix: Record<MShift, Record<MLength, MCell>>; activeSubscribers: number;
};
export type MPlanInput = {
  name: string; description: string | null; perks: string[]; featured: boolean; isActive: boolean;
  matrix: Record<MShift, Record<MLength, { price: number | null; discount: number }>>;
};

export const getPlans = () => api<MPlan[]>("/admin/membership/plans");
export const savePlan = (id: string | null, b: MPlanInput) =>
  api<MPlan>(id ? `/admin/membership/plans/${id}` : "/admin/membership/plans", { method: id ? "PUT" : "POST", body: JSON.stringify(b) });
