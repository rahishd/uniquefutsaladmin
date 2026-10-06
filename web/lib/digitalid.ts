import { api } from "./api";
import type { Profile } from "./customers";

export type Found = { phoneNumber: string; name: string | null; isActive: boolean };

export type Extras = {
  upcomingBookings: { code: string; date: string; time: string; status: string; amount: number; paid: boolean; method: string }[];
  addOns: { total: number; bottles: number; recent: { code: string; date: string; items: string | null; bottles: number; price: number }[] };
  gamezone: { completed: number; upcoming: number; recent: { code: string; game: string; date: string; time: string; hours: number; total: number; status: string; paymentStatus: string }[] };
  loyalty: { points: number; freeGameVouchers: number };
  referrals: {
    asReferrer: { total: number; approved: number; pending: number };
    asFriend: { total: number; approved: number; pending: number };
    recent: { code: string; role: "referrer" | "friend"; status: string; teamName: string; gameDate: string }[];
  };
  membership: null | {
    plan: string; memberCode: string | null; timeSlot: string | null; startDate: string; endDate: string; paymentStatus: string;
    attendedToday: boolean; attendanceCount: number; attendanceThisMonth: number; recentDays: string[];
  };
  membershipCount: number;
  spent: { games: number; goods: number; total: number; unpaid: number };
};
export type DigitalView = { profile: Profile; extras: Extras };
export type CardData = { name: string; phone: string; payload: string; whatsapp: string };

export const resolveCode = (code: string) => api<{ phone: string; name: string | null }>("/admin/digital-id/resolve", { method: "POST", body: JSON.stringify({ code }) });
export const searchCustomers = (q: string) => api<Found[]>(`/admin/digital-id/search?q=${encodeURIComponent(q)}`);
export const loadDigital = (phone: string) => api<DigitalView>(`/admin/digital-id/${encodeURIComponent(phone)}`);
export const loadCard = (phone: string) => api<CardData>(`/admin/digital-id/${encodeURIComponent(phone)}/card`);
export const markAttendance = (phone: string) => api<{ alreadyMarked: boolean; date: string }>(`/admin/digital-id/${encodeURIComponent(phone)}/attendance`, { method: "POST", body: "{}" });
