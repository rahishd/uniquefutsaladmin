import { api } from "./api";
import { shiftDate, todayKey } from "./slots";

export type Kind = "court" | "gamezone";
export type PayStatus = "paid" | "unpaid" | "cancelled";
export type Mode = "cash" | "online" | "fonepay";
export type Period = "today" | "week" | "month" | "all" | "custom";

export type Filters = { kind: Kind; status: PayStatus | ""; mode: Mode | ""; period: Period; from: string; to: string; q: string };

export type Row = {
  kind: Kind;
  id: string;
  ref: string; // court: booking id, gamezone: session code (what the mark-paid call needs)
  code: string;
  date: string;
  time: string;
  customer: string | null;
  phone: string | null;
  amount: number;
  status: PayStatus;
  method: string;
  mode: "cash" | "online";
};

export type Ledger = { items: Row[]; total: number; page: number; limit: number };
type Tot = { sum: number; count: number };
export type Summary = {
  paid: Tot; unpaid: Tot; cancelled: number;
  paidCash: Tot; paidOnline: Tot; paidEsewa: Tot; paidFonepay: Tot; unpaidCash: Tot; unpaidOnline: Tot;
};

export const PAGE_SIZE = 20;

// Dates in Nepal time. "Week" is the last 7 days including today; "month" starts on the 1st.
export function range(p: Period, from: string, to: string): { from?: string; to?: string } {
  const t = todayKey();
  if (p === "today") return { from: t, to: t };
  if (p === "week") return { from: shiftDate(t, -6), to: t };
  if (p === "month") return { from: `${t.slice(0, 7)}-01`, to: t };
  if (p === "custom") return { from: from || undefined, to: to || undefined };
  return {};
}

function query(f: Filters) {
  const qs = new URLSearchParams({ kind: f.kind });
  if (f.status) qs.set("status", f.status);
  if (f.mode) qs.set("mode", f.mode);
  const r = range(f.period, f.from, f.to);
  if (r.from) qs.set("from", r.from);
  if (r.to) qs.set("to", r.to);
  if (f.q.trim()) qs.set("q", f.q.trim());
  return qs;
}

export const listPayments = (f: Filters, page: number) => {
  const qs = query(f);
  qs.set("page", String(page));
  qs.set("limit", String(PAGE_SIZE));
  return api<Ledger>(`/admin/payments/ledger?${qs}`);
};

export const paymentSummary = (f: Filters) => {
  const qs = query(f);
  qs.delete("status"); // the cards always show paid and unpaid side by side
  return api<Summary>(`/admin/payments/summary?${qs}`);
};

export type CollectTarget = Pick<Row, "kind" | "ref" | "code" | "customer" | "amount" | "method"> & { phone?: string | null };

// Court bookings are collected through the dues call (cash, Fonepay QR or both); only Gamezone sessions use this one.
export const collectGamezone = (row: CollectTarget, pay: { payments?: { method: "cash" | "fonepay"; amount: number }[]; single?: "cash" | "fonepay"; fonepayQrId?: string } = {}) =>
  api(`/admin/gamezone/bookings/${encodeURIComponent(row.ref)}/mark-paid`, { method: "POST", body: JSON.stringify(pay) });

export const METHOD_LABEL: Record<string, string> = { venue: "Cash at venue", fonepay: "Fonepay", esewa: "eSewa (old)" };
