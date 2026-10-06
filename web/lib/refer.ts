import { api } from "./api";

export type RStatus = "pending" | "approved" | "rejected";

export type Referral = {
  id: string; code: string; status: RStatus; teamName: string; bookingCode: string | null; gameDate: string; gameTime: string;
  referrerPhone: string; referrerName: string | null; friendPhone: string; friendName: string | null;
  referrerPoints: number; friendPoints: number; staffNote: string | null; decidedAt: string | null; createdAt: string;
  booking: { status: string; paymentStatus: string; total: number } | null;
};
export type RList = { items: Referral[]; total: number; page: number; limit: number };
export type RCounts = Record<"all" | RStatus, number>;
export type RRules = { enabled: boolean; referrerPoints: number; friendPoints: number };
export type ROverview = { pending: number; approved: number; rejected: number; pointsGiven: number; rules: RRules };

export const PAGE_SIZE = 20;

export const STATUS: Record<RStatus, { label: string; tone: string }> = {
  pending: { label: "Waiting", tone: "bg-amber-500/15 text-amber-600" },
  approved: { label: "Approved", tone: "bg-brand/15 text-brand" },
  rejected: { label: "Rejected", tone: "bg-slate-500/15 text-slate-500" },
};

export const overview = () => api<ROverview>("/admin/refer/overview");
export const counts = () => api<RCounts>("/admin/refer/counts");
export const list = (p: { status: RStatus | ""; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<RList>(`/admin/refer?${qs}`);
};
export const approve = (id: string, b: { referrerPoints: number; friendPoints: number }) => api<Referral>(`/admin/refer/${id}/approve`, { method: "POST", body: JSON.stringify(b) });
export const reject = (id: string, reason: string) => api<Referral>(`/admin/refer/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
export const adjust = (id: string, b: { referrerPoints: number; friendPoints: number; reason: string }) => api<Referral>(`/admin/refer/${id}/adjust`, { method: "POST", body: JSON.stringify(b) });
export const saveRules = (b: RRules) => api<RRules>("/admin/refer/settings", { method: "PUT", body: JSON.stringify(b) });

export function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
export function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
