import { api } from "./api";

export type Rec = { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; form: ("W" | "D" | "L")[] };
export type TeamRow = { id: string; name: string; area: string; captain: { phone: string; name: string | null }; members: number; createdAt: string; record: Rec; openChallenges: number };
export type TeamDetail = {
  id: string; name: string; area: string; createdAt: string; record: Rec;
  members: { phone: string; name: string | null; position: string; captain: boolean; joinedAt: string }[];
  challenges: { id: string; status: string; date: string; startHour: number; versus: string; youChallenged: boolean; result: { status: string; goalsFor: number; goalsAgainst: number } | null }[];
};
export type TeamsOverview = { teams: number; pendingChallenges: number; upcomingGames: number; resultsAwaitingApproval: number; disputes: number; unpaidGames: number; unpaidAmount: number };
export type ChallengeStatus = "" | "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type ChallengeRow = {
  id: string; type: string; status: string; date: string; startHour: number; courtPrice: number; loserPct: number; message: string | null; challenger: string; challenged: string;
  bookingCode: string | null; venuePaidAt: string | null; createdAt: string; result: { status: string; submittedBy: string; scoreSubmitter: number; scoreOther: number } | null;
};
export type Dispute = { id: string; challengeId: string; date: string; startHour: number; submittedBy: string; otherTeam: string; scoreSubmitter: number; scoreOther: number; createdAt: string };
export type Settlement = {
  id: string; date: string; startHour: number; courtPrice: number; challenger: string; challenged: string; loserPct: number; resultApproved: boolean;
  split: { challenger: number; challenged: number; basis: string } | null; paidAt: string | null;
};

export const PAGE_SIZE = 25;
export const getOverview = () => api<TeamsOverview>("/admin/teams/overview");
export const listTeams = (q: string) => api<TeamRow[]>(`/admin/teams?q=${encodeURIComponent(q)}`);
export const getTeam = (id: string) => api<TeamDetail>(`/admin/teams/${id}`);
export const listChallenges = (p: { status: ChallengeStatus; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<{ items: ChallengeRow[]; total: number; page: number; limit: number }>(`/admin/teams/challenges?${qs}`);
};
export const listDisputes = () => api<Dispute[]>("/admin/teams/disputes");
export const resolveDispute = (id: string, b: { action: "approve" | "void"; scoreSubmitter?: number; scoreOther?: number; note?: string }) => api<null>(`/admin/teams/results/${id}/resolve`, { method: "POST", body: JSON.stringify(b) });
export const listSettlements = (date: string) => api<Settlement[]>(`/admin/teams/settlements${date ? `?date=${date}` : ""}`);
export const markVenuePaid = (id: string) => api<{ alreadyPaid: boolean }>(`/admin/teams/challenges/${id}/venue-paid`, { method: "POST", body: "{}" });

export const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
export const fmtDay = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700", accepted: "bg-green-500/15 text-green-700", declined: "bg-red-500/15 text-red-700", cancelled: "bg-surface-2 text-muted", expired: "bg-surface-2 text-muted",
  approved: "bg-green-500/15 text-green-700", awaiting_approval: "bg-amber-500/15 text-amber-700", disputed: "bg-red-500/15 text-red-700",
};
export const STATUS_LABEL: Record<string, string> = { awaiting_approval: "Awaiting approval", disputed: "Disputed", approved: "Approved" };
