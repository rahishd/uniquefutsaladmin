import { api } from "./api";

export type Mode = "captain" | "player";

export type CustomerRow = {
  phoneNumber: string;
  name: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  mode: Mode;
  vip: null | { code: string; active: boolean };
  stats: { gamesPlayed: number; gamezoneSessions: number; paidTotal: number; unpaidTotal: number; openComplaints: number; cancelStreak: number };
};
export type CustomerList = {
  items: CustomerRow[]; total: number; page: number; limit: number;
  totals: { registered: number; active: number; suspended: number; captains: number }; // everyone with an account, whatever the filters
};

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
  cancellations: {
    streak: number; total: number; last30: number; lateCount: number;
    recent: { kind: "court" | "gamezone"; code: string; date: string; time: string; amount: number; cancelledAt: string | null; hoursBefore: number | null; wasPaid: boolean }[];
  };
  vip: null | { code: string; type: "percent" | "flat"; value: number; active: boolean; note: string | null; claimedAt: string | null; createdAt: string; usage: { games: number; discountGiven: number } };
};

export type VipInput = { code: string; type: "percent" | "flat"; value: number; active: boolean; note?: string | null };

export const PAGE_SIZE = 20;

export const listCustomers = (p: { q: string; mode: Mode | ""; status: "" | "active" | "suspended"; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.mode) qs.set("mode", p.mode);
  if (p.status) qs.set("status", p.status);
  return api<CustomerList>(`/admin/customers?${qs}`);
};

export const getProfile = (phone: string) => api<Profile>(`/admin/customers/${encodeURIComponent(phone)}/profile`);
export const saveVip = (phone: string, v: VipInput) => api(`/admin/customers/${encodeURIComponent(phone)}/vip`, { method: "PUT", body: JSON.stringify(v) });
export const removeVip = (phone: string) => api(`/admin/customers/${encodeURIComponent(phone)}/vip`, { method: "DELETE" });
export const setActive = (phone: string, active: boolean) => api(`/admin/customers/${encodeURIComponent(phone)}/${active ? "unsuspend" : "suspend"}`, { method: "POST", body: "{}" });

// Staff add a customer by hand. With a password the customer can sign in to the app with the mobile number; without one it is a record only.
export const addCustomer = (b: { name: string; phoneNumber: string; email?: string; password?: string }) =>
  api<{ phoneNumber: string; name: string | null; email: string | null; canSignIn: boolean }>("/admin/customers", { method: "POST", body: JSON.stringify(b) });

export const initials = (name: string | null, phone: string) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || phone.slice(-2);

export type CustomerEdit = { name?: string; email?: string | null; phoneNumber?: string; password?: string };
export const editCustomer = (phone: string, v: CustomerEdit) => api(`/admin/customers/${encodeURIComponent(phone)}`, { method: "PATCH", body: JSON.stringify(v) });
