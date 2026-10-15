import { api } from "./api";

export type GRTotals = { games: number; completed: number; abandoned: number; rewarded: number; players: number; shots: number; goals: number; saves: number; misses: number; points: number };
export type GRGame = {
  id: string; phone: string; name: string | null; day: string; status: "active" | "completed" | "abandoned";
  shots: number; goals: number; saves: number; misses: number; points: number; rewardId: string | null;
  startedAt: string; finishedAt: string | null; seconds: number | null;
};
export type GRFlag = { phone: string; name: string | null; reasons: string[]; games: number };
export type GRList = {
  totals: { all: GRTotals; today: GRTotals; month: GRTotals };
  byDay: { day: string; games: number; goals: number; points: number }[];
  flags: GRFlag[];
  total: number; page: number; limit: number;
  items: GRGame[];
};
export type GRShot = { no: number; outcome: string; aimX: number; aimY: number; power: number; ballX: number; ballY: number; keeper: string; createdAt: string };
export type GRDetail = GRGame & { userId: string; shotsTaken: number; shots: GRShot[]; reward: { id: string; points: number; earnedOn: string; expiresOn: string | null; detail: string } | null };

export const PAGE_SIZE = 20;
export type GRFilters = { status: "" | "completed" | "abandoned" | "active"; rewarded: "" | "yes" | "no"; q: string };

export function listGoalRush(f: GRFilters, page: number) {
  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (f.status) qs.set("status", f.status);
  if (f.rewarded) qs.set("rewarded", f.rewarded);
  if (f.q.trim()) qs.set("q", f.q.trim());
  return api<GRList>(`/admin/goal-rush?${qs}`);
}
export const goalRushGame = (id: string) => api<GRDetail>(`/admin/goal-rush/${encodeURIComponent(id)}`);
