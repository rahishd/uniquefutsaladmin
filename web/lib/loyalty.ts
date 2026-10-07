import { api } from "./api";

export type Kind = "game" | "goods" | "membership" | "referral" | "captain_win" | "free_game";
export const KINDS: { id: Kind; label: string; tone: string }[] = [
  { id: "game", label: "Games", tone: "bg-green-500/15 text-green-700" }, { id: "goods", label: "Goods", tone: "bg-amber-500/15 text-amber-700" },
  { id: "membership", label: "Membership", tone: "bg-violet-500/15 text-violet-700" }, { id: "referral", label: "Referral", tone: "bg-pink-500/15 text-pink-700" },
  { id: "captain_win", label: "Challenge win", tone: "bg-blue-500/15 text-blue-700" }, { id: "free_game", label: "Spent or adjusted", tone: "bg-red-500/15 text-red-700" },
];
export const kindOf = (k: string) => KINDS.find((x) => x.id === k) ?? { id: k, label: k, tone: "bg-surface-2 text-muted" };

export type LoyaltyOverview = {
  from: string; to: string;
  period: { earned: number; spent: number; claims: number; byKind: { kind: Kind; points: number; entries: number }[] };
  now: { owedPoints: number; customersWithPoints: number; expiringSoon: { days: number; points: number; customers: number }; vouchers: { unused: number; used: number; void: number } };
};
export type Holder = { phone: string; name: string | null; balance: number; expiringSoon: number; unusedVouchers: number };
export type LedgerRow = { id: string; phone: string; name: string | null; kind: string; points: number; detail: string; earnedOn: string; expiresOn: string | null; expired: boolean; createdAt: string };
export type VoucherRow = { id: string; phone: string; name: string | null; period: string; cost: number; status: string; bookingCode: string | null; claimedAt: string; usedAt: string | null };
export type Paged<T> = { items: T[]; total: number; page: number; limit: number };
export type CustomerLedger = {
  approxBalance: number;
  rows: { id: string; kind: string; points: string | number; earnedOn: string; expiresOn: string | null; detail: string; createdAt: string }[];
  vouchers: { id: string; period: string; cost: string | number; status: string; claimedAt: string; usedAt: string | null }[];
};

export const PAGE_SIZE = 25;
export const getOverview = (from: string, to: string) => api<LoyaltyOverview>(`/admin/loyalty/overview?from=${from}&to=${to}`);
export const listHolders = (q: string, sort: "balance" | "expiring" | "name", page: number) =>
  api<Paged<Holder>>(`/admin/loyalty/customers?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}&limit=${PAGE_SIZE}`);
export const listLedger = (p: { kind: "" | Kind; q: string; from: string; to: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.kind) qs.set("kind", p.kind);
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.from) qs.set("from", p.from);
  if (p.to) qs.set("to", p.to);
  return api<Paged<LedgerRow>>(`/admin/loyalty/ledger?${qs}`);
};
export const listVouchers = (status: "" | "unused" | "used" | "void", page: number) => api<Paged<VoucherRow>>(`/admin/loyalty/vouchers?status=${status}&page=${page}&limit=${PAGE_SIZE}`);
export const getCustomer = (phone: string) => api<CustomerLedger>(`/admin/loyalty/customers/${phone}`);
export const adjustPoints = (b: { phone: string; points: number; reason: string }) => api<null>("/admin/loyalty/adjust", { method: "POST", body: JSON.stringify(b) });
export const voidVoucher = (id: string) => api<null>(`/admin/loyalty/vouchers/${id}/void`, { method: "POST", body: "{}" });

export const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const pts = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;
