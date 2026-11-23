import { api } from "./api";

export type LudoTotals = { games: number; solo: number; multi: number; completed: number; abandoned: number; cancelled: number; players: number; pointsCollected: number; pointsGiven: number; pointsRefunded: number; rewards: number };
export type LudoStatus = "lobby" | "active" | "completed" | "abandoned" | "cancelled";
export type LudoGame = {
  id: string; code: string; mode: "solo" | "multi"; status: LudoStatus; difficulty: string; day: string | null; startedAt: string | null; finishedAt: string | null; cancelReason: string | null; seconds: number | null;
  players: { seat: number; phone: string | null; name: string; isBot: boolean; result: string | null; won: boolean }[];
};
export type LudoFlag = { phone: string; name: string | null; reasons: string[]; games: number };
export type LudoList = {
  totals: { all: LudoTotals; today: LudoTotals; month: LudoTotals };
  byDay: { day: string; games: number; solo: number; multi: number }[];
  flags: LudoFlag[];
  total: number; page: number; limit: number;
  items: LudoGame[];
};
type Pts = { id: string; points: number; earnedOn: string } | null;
export type LudoDetail = {
  id: string; code: string; mode: "solo" | "multi"; status: LudoStatus; difficulty: string; day: string | null; hostId: string; winnerSeat: number | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; cancelReason: string | null;
  players: { seat: number; phone: string | null; name: string; isBot: boolean; botControl: boolean; status: string; result: string | null; rank: number | null; captures: number; fee: Pts; reward: Pts; refund: Pts }[];
  events: { seq: number; seat: number; kind: string; value: number | null; token: number | null; detail: string | null; at: string }[];
};

export const PAGE_SIZE = 20;
export type LudoFilters = { status: "" | LudoStatus; mode: "" | "solo" | "multi"; q: string };

export function listLudo(f: LudoFilters, page: number) {
  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (f.status) qs.set("status", f.status);
  if (f.mode) qs.set("mode", f.mode);
  if (f.q.trim()) qs.set("q", f.q.trim());
  return api<LudoList>(`/admin/ludo?${qs}`);
}
export const ludoGame = (id: string) => api<LudoDetail>(`/admin/ludo/${encodeURIComponent(id)}`);
