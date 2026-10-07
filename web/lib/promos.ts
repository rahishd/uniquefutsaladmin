import { api } from "./api";

export type PromoState = "active" | "paused" | "expired" | "used_up";
// Days are stored as full names, which is what the customer app compares with
export type Day = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
export const DAYS: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type AppliesTo = "booking" | "membership" | "both";
export type PromoInput = {
  code: string; type: "percent" | "flat"; value: number; label: string; title?: string; description?: string; expiryDate?: string;
  validDays?: Day[]; startTime?: string; endTime?: string; isActive: boolean; appliedTo: AppliesTo; maxUses?: number; maxPerCustomer?: number;
};
export type Promo = PromoInput & { status: PromoState; uses: number; discountGiven: number; lastUsedAt: string | null };

export const listPromos = () => api<Promo[]>("/admin/promos");
export const createPromo = (p: PromoInput) => api<PromoInput>("/admin/promos", { method: "POST", body: JSON.stringify(p) });
export const savePromo = (p: PromoInput) => api<PromoInput>(`/admin/promos/${encodeURIComponent(p.code)}`, { method: "PUT", body: JSON.stringify(p) });
export const setPromoActive = (code: string, isActive: boolean) => api<PromoInput>(`/admin/promos/${encodeURIComponent(code)}/active`, { method: "PATCH", body: JSON.stringify({ isActive }) });
export const removePromo = (code: string) => api<null>(`/admin/promos/${encodeURIComponent(code)}`, { method: "DELETE" });

export const autoLabel = (type: "percent" | "flat", value: number) => (value > 0 ? (type === "percent" ? `${value}% OFF` : `Rs. ${value} OFF`) : "");
export const fmtDay = (k: string) => new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
export const APPLIES: Record<AppliesTo, string> = { booking: "Court bookings", membership: "Memberships", both: "Bookings and memberships" };

// The conditions in words, the way a customer reads them
export function conditions(p: Pick<PromoInput, "expiryDate" | "validDays" | "startTime" | "endTime" | "appliedTo" | "maxUses" | "maxPerCustomer">): string[] {
  const out: string[] = [APPLIES[p.appliedTo]];
  out.push(p.expiryDate ? `Until ${fmtDay(p.expiryDate)}` : "No end date");
  if (p.validDays?.length && p.validDays.length < 7) out.push(`Only ${p.validDays.map((d) => d.slice(0, 3)).join(", ")}`);
  if (p.startTime && p.endTime) out.push(`Slots from ${clock(p.startTime)} to ${clock(p.endTime)}`);
  if (p.maxUses) out.push(`First ${p.maxUses} use${p.maxUses === 1 ? "" : "s"} only`);
  if (p.maxPerCustomer) out.push(p.maxPerCustomer === 1 ? "One use per customer" : `${p.maxPerCustomer} uses per customer`);
  return out;
}
