import { ApiError, API_BASE, api, getToken } from "./api";
import { showDenied } from "./access";
import { nepalDay } from "./bookings";

export type Mode = "captain" | "player";
// what the Customers page can filter by: the customer type, VIP customers, or customers with a running membership
export type Filter = Mode | "vip" | "member";

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

export const listCustomers = (p: { q: string; mode: Filter | ""; status: "" | "active" | "suspended"; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.mode) qs.set("mode", p.mode);
  if (p.status) qs.set("status", p.status);
  return api<CustomerList>(`/admin/customers?${qs}`);
};

// Downloads the customers as an Excel file (the same search and filters as the list; none = everyone). Needs the export permission.
export async function downloadCustomersExcel(p: { q: string; mode: Filter | ""; status: "" | "active" | "suspended" }) {
  const qs = new URLSearchParams();
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.mode) qs.set("mode", p.mode);
  if (p.status) qs.set("status", p.status);
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/customers/export?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 403) showDenied();
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.message ?? `Could not export (${res.status})`);
  const name = `unique-futsal-customers-${nepalDay()}.xlsx`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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
export const deleteCustomer = (phone: string) => api(`/admin/customers/${encodeURIComponent(phone)}`, { method: "DELETE" });
