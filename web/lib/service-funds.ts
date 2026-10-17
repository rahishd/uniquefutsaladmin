import { api } from "./api";

export type Fund = {
  id: string; name: string; kind: "percent" | "manual"; rate: number | null; defaultAmount: number | null; active: boolean; note: string | null; autoSince: string | null;
  receivedToday: number; received: number; deposits: number; lastDeposit: string | null; withdrawn: number;
  depositedAll: number; withdrawnAll: number; balance: number; toDeposit: number | null;
};
export type Takings = { courts: number; memberships: number; gamezone: number; club: number; tournaments: number; giftCards: number; total: number; games: number; gamesCount: number };
export type FundsView = {
  today: string; base: Takings; from: string | null; to: string | null;
  totals: { receivedToday: number; received: number; withdrawn: number; balance: number; toDeposit: number };
  items: Fund[];
};
export type Entry = { id: string; type: "deposit" | "withdrawal"; fundId: string; fund: string; amount: number; note: string | null; date: string; by: string; at: string; auto: boolean };
export type Ledger = { total: number; page: number; limit: number; received: number; withdrawn: number; items: Entry[] };
export type Collections = {
  from: string; to: string; funds: { id: string; name: string; rate: number | null }[];
  days: { date: string; games: number; base: number; funds: { fundId: string; amount: number }[] }[];
  totals: { games: number; base: number; funds: { fundId: string; amount: number }[] };
};

export const PAGE_SIZE = 15;

const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "")).toString();

export const loadFunds = (from: string, to: string) => api<FundsView>(`/admin/service-funds?${qs({ from, to })}`);
export const loadCollections = (from: string, to: string) => api<Collections>(`/admin/service-funds/collections?${qs({ from, to })}`);
export const loadLedger = (p: { fundId: string; type: string; from: string; to: string; q: string; page: number }) =>
  api<Ledger>(`/admin/service-funds/ledger?${qs({ page: String(p.page), limit: String(PAGE_SIZE), fundId: p.fundId, type: p.type, from: p.from, to: p.to, q: p.q.trim() })}`);
export const addFund = (b: { name: string; kind: "percent" | "manual"; rate?: number; defaultAmount?: number; note?: string }) =>
  api<Fund>("/admin/service-funds/funds", { method: "POST", body: JSON.stringify(b) });
export const editFund = (id: string, b: Partial<{ name: string; rate: number; defaultAmount: number; note: string; active: boolean }>) =>
  api<Fund>(`/admin/service-funds/funds/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });
export const depositAmount = (id: string, b: { amount: number; note?: string; date?: string }) =>
  api<{ amount: number }>(`/admin/service-funds/funds/${encodeURIComponent(id)}/deposit`, { method: "POST", body: JSON.stringify(b) });
export const withdrawAmount = (id: string, b: { amount: number; note: string; date?: string }) =>
  api<{ amount: number }>(`/admin/service-funds/funds/${encodeURIComponent(id)}/withdraw`, { method: "POST", body: JSON.stringify(b) });
