import { api } from "./api";

export type ClubStatus = "" | "active" | "expiring" | "expired";

export type ClubMemberRow = {
  phone: string;
  name: string | null;
  status: "active" | "expiring" | "expired";
  startedAt: string;
  validUntil: string;
  lastPaidAt: string;
  daysLeft: number;
  payments: number;
  paidTotal: number;
  daysIn: number;
  gamesPlayed: number;
  mature: boolean; // the 1-month membership and tournament-hosting discounts are unlocked
  discountGiven: number;
  discountedGames: number;
};

export type ClubList = {
  total: number;
  page: number;
  limit: number;
  matureAfterDays: number;
  matureAfterGames: number;
  summary: { active: number; expiring: number; expired: number; members: number; revenue: number; payments: number };
  items: ClubMemberRow[];
};

export const PAGE_SIZE = 20;

export function listClub(p: { status: ClubStatus; q: string; page: number }) {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<ClubList>(`/admin/club?${qs}`);
}
