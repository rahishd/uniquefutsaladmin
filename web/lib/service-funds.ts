import { api } from "./api";

export type Fund = {
  id: string; name: string; kind: "percent" | "manual"; rate: number | null; defaultAmount: number | null; active: boolean; note: string | null;
  accrued: number | null; deposited: number; deposits: number; lastDeposit: string | null; depositedAll: number; toDeposit: number | null;
};
export type Takings = { courts: number; memberships: number; gamezone: number; club: number; tournaments: number; giftCards: number; total: number };
export type FundsView = { base: Takings; from: string | null; to: string | null; totals: { deposited: number; toDeposit: number }; items: Fund[] };
export type Deposit = { id: string; fundId: string; fund: string; amount: number; note: string | null; date: string; by: string; at: string };
export type DepositList = { total: number; page: number; limit: number; sum: number; items: Deposit[] };

export const PAGE_SIZE = 15;

export const loadFunds = (from: string, to: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return api<FundsView>(`/admin/service-funds?${qs}`);
};
export const loadDeposits = (p: { fundId: string; from: string; to: string; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.fundId) qs.set("fundId", p.fundId);
  if (p.from) qs.set("from", p.from);
  if (p.to) qs.set("to", p.to);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<DepositList>(`/admin/service-funds/deposits?${qs}`);
};
export const addFund = (b: { name: string; kind: "percent" | "manual"; rate?: number; defaultAmount?: number; note?: string }) =>
  api<Fund>("/admin/service-funds/funds", { method: "POST", body: JSON.stringify(b) });
export const editFund = (id: string, b: Partial<{ name: string; rate: number; defaultAmount: number; note: string; active: boolean }>) =>
  api<Fund>(`/admin/service-funds/funds/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });
export const depositAmount = (id: string, b: { amount: number; note?: string; date?: string }) =>
  api<Deposit>(`/admin/service-funds/funds/${encodeURIComponent(id)}/deposit`, { method: "POST", body: JSON.stringify(b) });
