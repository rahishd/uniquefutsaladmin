import { API_BASE, api, ApiError } from "./api";
import { withBase } from "./base";

export type Side = "home" | "away";
export type MatchStatus = "upcoming" | "live" | "finished";
export type Goal = { id: string; side: Side; minute: number | null; scorer: string | null };
export type Match = {
  id: string; home: string | null; away: string | null; status: MatchStatus; homeScore: number | null; awayScore: number | null;
  note: string | null; startsAt: string | null; venue: string | null; goals: Goal[];
};
export type Round = { id: string; name: string; matches: Match[] };

export type TournamentItem = {
  id: string; name: string; startDate: string; endDate: string; state: "upcoming" | "live" | "completed"; prizePool: number;
  minTeams: number; maxTeams: number; registrations: number; isActive: boolean; matches: number; live: number; finished: number;
  hostedEvent?: boolean; hostName?: string | null;
};
export type HostLink = { token: string; active: boolean; expired: boolean; expiresAt: string | null; lastUsedAt: string | null; createdAt: string };
export type TournamentDetail = {
  tournament: { id: string; name: string; startDate: string; endDate: string; state: TournamentItem["state"]; prizePool: number; registrations: number; hostedEvent?: boolean; hostName?: string | null };
  rounds: Round[]; hostLink: HostLink | null; canShare: boolean;
};

// What the editor needs from the outside. Staff use the signed-in API; the host link uses the secret in the link instead.
export type StructureRound = { id?: string; name: string; matches: { id?: string; home: string | null; away: string | null; startsAt: string | null; venue: string | null; note: string | null }[] };
export type GoalInput = { side: Side; minute: number | null; scorer: string | null };
export type StatusInput = { status: MatchStatus; homeScore?: number | null; awayScore?: number | null; note?: string | null };
export type EditorApi = {
  load: () => Promise<Round[]>;
  save: (rounds: StructureRound[]) => Promise<Round[]>;
  goal: (matchId: string, g: GoalInput) => Promise<Match>;
  undo: (goalId: string) => Promise<Match>;
  status: (matchId: string, s: StatusInput) => Promise<Match>;
};

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const listTournaments = () => api<TournamentItem[]>("/admin/tournaments");
export const getTournament = (id: string) => api<TournamentDetail>(`/admin/tournaments/${id}`);
export const createHostLink = (id: string) => api<HostLink>(`/admin/tournaments/${id}/host-link`, { method: "POST" });
export const revokeHostLink = (id: string) => api<null>(`/admin/tournaments/${id}/host-link`, { method: "DELETE" });

export const staffEditor = (id: string): EditorApi => ({
  load: () => getTournament(id).then((d) => d.rounds),
  save: (rounds) => api<{ rounds: Round[] }>(`/admin/tournaments/${id}/tiesheet`, { method: "PUT", ...json({ rounds }) }).then((r) => r.rounds),
  goal: (m, g) => api<{ match: Match }>(`/admin/tournaments/matches/${m}/goal`, { method: "POST", ...json(g) }).then((r) => r.match),
  undo: (g) => api<{ match: Match }>(`/admin/tournaments/goals/${g}`, { method: "DELETE" }).then((r) => r.match),
  status: (m, s) => api<{ match: Match }>(`/admin/tournaments/matches/${m}/status`, { method: "POST", ...json(s) }).then((r) => r.match),
});

// The host page has no staff sign-in, so it must not send (or drop) a staff token and must not sign anyone out on an error.
async function hostCall<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/admin/host/${encodeURIComponent(token)}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`);
  return (body?.data ?? body) as T;
}

export type HostView = { tournament: { id: string; name: string; startDate: string; endDate: string; state: TournamentItem["state"] }; rounds: Round[]; expiresAt: string | null };
export const hostView = (token: string) => hostCall<HostView>(token, "");

export const hostEditor = (token: string): EditorApi => ({
  load: () => hostView(token).then((d) => d.rounds),
  save: (rounds) => hostCall<{ rounds: Round[] }>(token, "/tiesheet", { method: "PUT", ...json({ rounds }) }).then((r) => r.rounds),
  goal: (m, g) => hostCall<{ match: Match }>(token, `/matches/${m}/goal`, { method: "POST", ...json(g) }).then((r) => r.match),
  undo: (g) => hostCall<{ match: Match }>(token, `/goals/${g}`, { method: "DELETE" }).then((r) => r.match),
  status: (m, s) => hostCall<{ match: Match }>(token, `/matches/${m}/status`, { method: "POST", ...json(s) }).then((r) => r.match),
});

// Times are Nepal time (UTC+5:45) whatever the device's time zone is.
const NEPAL_MS = (5 * 60 + 45) * 60_000;
export const toNepalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + NEPAL_MS).toISOString().slice(0, 16) : "");
export const fromNepalInput = (v: string) => (v ? new Date(`${v}:00+05:45`).toISOString() : null);
export const nepalTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export const hostUrl = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}${withBase("/host/" + token)}`;
