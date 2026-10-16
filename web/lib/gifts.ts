import { api } from "./api";

export type GiftKind = "points" | "game";
export type GiftStatus = "pending" | "paid" | "expired" | "refunded";

export type GiftItem = {
  id: string; code: string; kind: GiftKind; status: GiftStatus; points: number | null; amount: number; message: string | null; createdAt: string; paidAt: string | null;
  buyer: { phone: string; name: string | null };
  friend: { phone: string; name: string | null };
  payment: { orderCode: string; status: string | null; paidAt: string | null; refundPaid: boolean };
  game: { bookingId: string; code: string | null; date: string; startTime: string; endTime: string; status: string; paymentStatus: string } | null;
  pointsDelivered: boolean;
  pointsTakenBack: boolean;
};
export type GiftSummary = {
  paid: number; pending: number; expired: number; refunded: number; refundsDue: number; revenue: number;
  pointsGifts: number; pointsSold: number; pointsRevenue: number; gameGifts: number; gameRevenue: number;
};
export type GiftList = { total: number; page: number; limit: number; summary: GiftSummary; items: GiftItem[] };

export const PAGE_SIZE = 20;

export const STATUS: Record<GiftStatus, { label: string; tone: string }> = {
  paid: { label: "Paid & delivered", tone: "bg-emerald-500/15 text-emerald-700" },
  pending: { label: "Waiting for payment", tone: "bg-amber-500/15 text-amber-600" },
  expired: { label: "Not paid", tone: "bg-slate-500/15 text-slate-500" },
  refunded: { label: "Cancelled & refunded", tone: "bg-red-500/15 text-red-600" },
};

export const loadGifts = (p: { kind: GiftKind | ""; status: GiftStatus | ""; from: string; to: string; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.kind) qs.set("kind", p.kind);
  if (p.status) qs.set("status", p.status);
  if (p.from) qs.set("from", p.from);
  if (p.to) qs.set("to", p.to);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<GiftList>(`/admin/gifts?${qs}`);
};
export const cancelGift = (id: string, reason: string) => api<GiftItem>(`/admin/gifts/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
