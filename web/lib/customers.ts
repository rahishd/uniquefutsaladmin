import { api } from "./api";

export type Mode = "captain" | "player";

export type CustomerRow = {
  phoneNumber: string;
  name: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  mode: Mode;
  stats: { gamesPlayed: number; gamezoneSessions: number; paidTotal: number; unpaidTotal: number; openComplaints: number };
};
export type CustomerList = { items: CustomerRow[]; total: number; page: number; limit: number };

type Money = { amount: number; count: number };
type PayRow = { kind: "court" | "gamezone"; code: string; date: string; time: string; amount: number; status: "paid" | "unpaid" | "cancelled"; method: string };

export type Profile = {
  user: { phoneNumber: string; name: string | null; email: string | null; isActive: boolean; createdAt: string; isVerified: boolean };
  contact: { phone: string; whatsapp: string };
  profile: {
    mode: Mode;
    position: string | null;
    location: string | null;
    isCaptain: boolean;
    team: null | { id: string; name: string; area: string; role: "captain" | "member"; members: number; record: { played: number; won: number; drawn: number; lost: number } };
  };
  games: {
    played: number; upcoming: number; cancelled: number; noShows: number; gamezoneSessions: number; firstGame: string | null; lastGame: string | null;
    recent: { code: string; date: string; time: string; status: string; amount: number; paid: boolean }[];
  };
  payments: { paid: Money; paidCash: Money; paidOnline: Money; unpaid: Money; recent: PayRow[] };
  goods: { total: number; count: number; items: { id: string; amount: number; items: string | null; soldAt: string }[] };
  complaints: { total: number; open: number; recent: { id: string; code: string; categoryLabel: string; status: string; createdAt: string }[] };
  tournaments: {
    entered: { id: string; teamName: string; tournament: string; startDate: string; status: string }[];
    challengesHosted: { count: number; recent: { id: string; date: string; startHour: number; status: string; opponent: string | null }[] };
  };
  promos: { allOff: boolean; codes: { code: string; label: string; active: boolean; expiryDate: string | null; enabled: boolean }[] };
};

export const PAGE_SIZE = 20;

export const listCustomers = (p: { q: string; mode: Mode | ""; status: "" | "active" | "suspended"; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.mode) qs.set("mode", p.mode);
  if (p.status) qs.set("status", p.status);
  return api<CustomerList>(`/admin/customers?${qs}`);
};

export const getProfile = (phone: string) => api<Profile>(`/admin/customers/${encodeURIComponent(phone)}/profile`);
export const setPromo = (phone: string, code: string, enabled: boolean) =>
  api<{ disabled: string[] }>(`/admin/customers/${encodeURIComponent(phone)}/promos`, { method: "PUT", body: JSON.stringify({ code, enabled }) });
export const setActive = (phone: string, active: boolean) => api(`/admin/customers/${encodeURIComponent(phone)}/${active ? "unsuspend" : "suspend"}`, { method: "POST", body: "{}" });

export const initials = (name: string | null, phone: string) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || phone.slice(-2);
