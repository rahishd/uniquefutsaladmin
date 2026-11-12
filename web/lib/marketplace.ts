import { API_BASE, api, ApiError } from "./api";
import { withBase } from "./base";

// Partner Marketplace: businesses (cafes, swimming pools ...) that give our customers a discount for loyalty points.
export type PartnerStatus = "active" | "waiting" | "ended" | "paused";
export type Offer = { id: string; title: string; code: string; discountText: string; pointsCost: number; maxPerCustomer: number | null; active: boolean };
export type OfferInput = { title: string; code: string; discountText: string; pointsCost: number; maxPerCustomer?: number | null; active?: boolean };
// when and how long the banner shows (the same controls as an ad)
export type BannerSettings = { seconds: number; priority: number; on: boolean; startDate: string | null; endDate: string | null; dailyStart: string | null; dailyEnd: string | null; days: number[]; status: "live" | "paused" | "scheduled" | "ended" | "waiting" };
export type BannerInput = { bannerSeconds: number; bannerPriority: number; bannerOn: boolean; bannerStart: string | null; bannerEnd: string | null; bannerDailyStart: string | null; bannerDailyEnd: string | null; bannerDays: number[] };
export const BANNER_STATUS: Record<BannerSettings["status"], { label: string; tone: string }> = {
  live: { label: "Showing now", tone: "bg-emerald-500/15 text-emerald-700" },
  waiting: { label: "Not in its hours today", tone: "bg-blue-500/15 text-blue-700" },
  scheduled: { label: "Scheduled", tone: "bg-amber-500/15 text-amber-700" },
  ended: { label: "Ended", tone: "bg-slate-500/15 text-slate-600" },
  paused: { label: "Off", tone: "bg-slate-500/15 text-slate-600" },
};
export type Partner = {
  id: string; name: string; category: string; contactName: string | null; contactPhone: string | null; about: string | null;
  agreementStart: string; agreementEnd: string; active: boolean; status: PartnerStatus; bannerUrl: string | null; banner: BannerSettings;
  link: { token: string; active: boolean; lastSeenAt: string | null }; offers: Offer[];
  stats: { active: number; used: number; cancelled: number };
};
export type PartnerInput = {
  name: string; category: string; contactName?: string | null; contactPhone?: string | null; about?: string | null;
  agreementStart: string; agreementEnd: string; active?: boolean; image?: string | null; removeBanner?: boolean;
} & Partial<BannerInput>;
export type Redemption = { id: string; code: string; customerName: string | null; phone: string; offerTitle: string; discountText: string; discountCode: string; points: number; status: "active" | "used" | "cancelled"; createdAt: string; usedAt: string | null };

export const STATUS: Record<PartnerStatus, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-emerald-500/15 text-emerald-700" },
  waiting: { label: "Starts soon", tone: "bg-blue-500/15 text-blue-700" },
  ended: { label: "Agreement ended", tone: "bg-slate-500/15 text-slate-600" },
  paused: { label: "Paused", tone: "bg-amber-500/15 text-amber-700" },
};
export const CARD_STATUS: Record<Redemption["status"], { label: string; tone: string }> = {
  active: { label: "Not used yet", tone: "bg-blue-500/15 text-blue-700" },
  used: { label: "Used", tone: "bg-emerald-500/15 text-emerald-700" },
  cancelled: { label: "Cancelled", tone: "bg-slate-500/15 text-slate-600" },
};

const json = (b: unknown) => ({ body: JSON.stringify(b) });
export const listPartners = () => api<{ categories: string[]; items: Partner[] }>("/admin/marketplace");
export const createPartner = (b: PartnerInput & { offers: OfferInput[] }) => api<Partner>("/admin/marketplace", { method: "POST", ...json(b) });
export const editPartner = (id: string, b: Partial<PartnerInput>) => api<Partner>(`/admin/marketplace/${id}`, { method: "PATCH", ...json(b) });
export const deletePartner = (id: string) => api<null>(`/admin/marketplace/${id}`, { method: "DELETE" });
export const newLink = (id: string) => api<Partner>(`/admin/marketplace/${id}/link`, { method: "POST", ...json({}) });
export const linkOff = (id: string) => api<Partner>(`/admin/marketplace/${id}/link`, { method: "DELETE" });
export const addOffer = (id: string, b: OfferInput) => api<Partner>(`/admin/marketplace/${id}/offers`, { method: "POST", ...json(b) });
export const editOffer = (id: string, oid: string, b: Partial<OfferInput>) => api<Partner>(`/admin/marketplace/${id}/offers/${oid}`, { method: "PATCH", ...json(b) });
export const deleteOffer = (id: string, oid: string) => api<Partner>(`/admin/marketplace/${id}/offers/${oid}`, { method: "DELETE" });
export const listRedemptions = (id: string) => api<Redemption[]>(`/admin/marketplace/${id}/redemptions`);
export const cancelRedemption = (rid: string) => api<null>(`/admin/marketplace/redemptions/${rid}/cancel`, { method: "POST", ...json({}) });

// the dashboard link the partner receives: a page of this portal that needs no sign-in
export const dashboardUrl = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}${withBase("/partner/" + token)}`;

/* ---------- the partner's own dashboard (no staff sign-in: the secret in the link is the key) ---------- */
export type PartnerDash = {
  partner: { name: string; category: string; about: string | null; agreementStart: string; agreementEnd: string; status: PartnerStatus; bannerUrl: string | null };
  offers: Offer[]; stats: { total: number; active: number; used: number }; redemptions: Redemption[];
};
async function partnerCall<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/admin/partner/${encodeURIComponent(token)}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`);
  return (body?.data ?? body) as T;
}
export const partnerView = (token: string) => partnerCall<PartnerDash>(token, "");
export const partnerVerify = (token: string, code: string) => partnerCall<Redemption>(token, "/verify", { method: "POST", ...json({ code }) });
export const partnerMarkUsed = (token: string, rid: string) => partnerCall<PartnerDash>(token, `/redemptions/${rid}/used`, { method: "POST", ...json({}) });
export type PartnerOfferInput = { title: string; discountText: string; maxPerCustomer?: number | null };
export const partnerAddOffer = (token: string, b: PartnerOfferInput) => partnerCall<PartnerDash>(token, "/offers", { method: "POST", ...json(b) });
export const partnerEditOffer = (token: string, oid: string, b: Partial<PartnerOfferInput> & { active?: boolean }) => partnerCall<PartnerDash>(token, `/offers/${oid}`, { method: "PATCH", ...json(b) });
export const partnerDeleteOffer = (token: string, oid: string) => partnerCall<PartnerDash>(token, `/offers/${oid}`, { method: "DELETE" });
export const partnerBanner =(token: string, image: string) => partnerCall<PartnerDash>(token, "/banner", { method: "POST", ...json({ image }) });

export const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kathmandu" });
