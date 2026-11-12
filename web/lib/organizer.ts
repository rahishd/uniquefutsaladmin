import { api } from "./api";
import type { Bill } from "./hosted-tournaments";
import type { EditorApi, Match, Round, StructureRound, TournamentItem } from "./tournaments";

// The Tournament Organizer app (/organizer). The account is a staff-made sign-in with role "organizer": it can only open the hosted
// tournaments given to it, through /admin/organizer/*.
export type OrgPrize = { place: string; cash: number; trophy: string; note: string };
export type OrgTournament = {
  id: string; name: string; startDate: string; endDate: string; state: TournamentItem["state"]; hostName: string | null; description: string | null; prizePool: number; prizes: OrgPrize[]; rules: string; maxTeams: number;
  days: { date: string; startHour: number; endHour: number }[];
};
export type OrgMe = { id: string; name: string; email: string; avatar: string | null; tournaments: OrgTournament[] };
export type OrgTeam = { id: string; teamName: string; captainName: string; phone: string; status: "pending" | "approved" | "rejected"; players: string[] };

const json = (body: unknown) => ({ body: JSON.stringify(body) });
const base = (tid: string) => `/admin/organizer/tournaments/${encodeURIComponent(tid)}`;

export const orgMe = () => api<OrgMe>("/admin/organizer/me");
export const orgTeams = (tid: string) => api<{ maxTeams: number; registrationClosed: boolean; items: OrgTeam[] }>(`${base(tid)}/teams`);
export const orgSetRegistrationClosed = (tid: string, closed: boolean) => api<{ registrationClosed: boolean }>(`${base(tid)}/registration`, { method: "PUT", ...json({ closed }) });
export type TeamInput = { teamName: string; captainName: string; phone: string; players: string[] };
export const orgAddTeam = (tid: string, b: TeamInput) => api<OrgTeam>(`${base(tid)}/teams`, { method: "POST", ...json(b) });
export const orgEditTeam = (tid: string, id: string, b: Partial<TeamInput> & { status?: OrgTeam["status"] }) => api<OrgTeam>(`${base(tid)}/teams/${encodeURIComponent(id)}`, { method: "PATCH", ...json(b) });
export const orgDeleteTeam = (tid: string, id: string) => api<null>(`${base(tid)}/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
export const orgSavePrizes = (tid: string, prizes: OrgPrize[]) => api<{ prizes: OrgPrize[]; prizePool: number }>(`${base(tid)}/prizes`, { method: "PUT", ...json({ prizes }) });
export const orgSaveRules = (tid: string, rules: string) => api<{ rules: string }>(`${base(tid)}/rules`, { method: "PUT", ...json({ rules }) });
export const orgSaveMaxTeams = (tid: string, maxTeams: number) => api<{ maxTeams: number }>(`${base(tid)}/max-teams`, { method: "PUT", ...json({ maxTeams }) });
export const orgSetLiveLink = (tid: string, matchId: string, url: string | null) => api<{ liveUrl: string | null }>(`${base(tid)}/matches/${encodeURIComponent(matchId)}/live-link`, { method: "PUT", ...json({ url }) });
export const orgBilling = (tid: string) => api<Bill | null>(`${base(tid)}/billing`);
export const orgChangePassword = (current: string, next: string) => api<{ token: string }>("/admin/auth/change-password", { method: "POST", ...json({ current, next }) });

// the same editor contract the staff and the old host link used, so the match-scoring screen is shared
export const organizerEditor = (tid: string): EditorApi => ({
  load: () => api<{ rounds: Round[] }>(`${base(tid)}/sheet`).then((r) => r.rounds),
  save: (rounds: StructureRound[]) => api<{ rounds: Round[] }>(`${base(tid)}/sheet`, { method: "PUT", ...json({ rounds }) }).then((r) => r.rounds),
  goal: (m, g) => api<{ match: Match }>(`${base(tid)}/matches/${m}/goal`, { method: "POST", ...json(g) }).then((r) => r.match),
  undo: (g) => api<{ match: Match }>(`${base(tid)}/goals/${g}`, { method: "DELETE" }).then((r) => r.match),
  status: (m, s) => api<{ match: Match }>(`${base(tid)}/matches/${m}/status`, { method: "POST", ...json(s) }).then((r) => r.match),
});
