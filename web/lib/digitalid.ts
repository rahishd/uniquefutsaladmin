import { api } from "./api";
import type { Profile } from "./customers";

export type Found = { phoneNumber: string; name: string | null; isActive: boolean };

export type Extras = {
  club: null | {
    member: boolean; validUntil: string; startedAt: string; daysLeft: number; payments: number; mature: boolean; daysIn: number; gamesPlayed: number;
    matureAfterDays: number; matureAfterGames: number; discountGiven: number; discountedGames: number;
  };
  goalRush: { gamesToday: number; pointsToday: number; goalsToday: number; gamesTotal: number; pointsTotal: number; recent: { day: string; status: string; goals: number; shots: number; points: number }[] };
  findPlayer: {
    hosting: { id: string; date: string; time: string; status: string; needed: number; joined: number }[];
    joined: { id: string; date: string; time: string; status: string; host: string }[];
  };
  upcomingBookings: { code: string; date: string; time: string; status: string; amount: number; paid: boolean; method: string; bulk: string | null }[];
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
  person: { email: string | null; dateOfBirth: string | null; age: number | null; hasPhoto: boolean; emergency: null | { name: string | null; phone: string; relation: string | null } };
  goods: { due: GoodsEntry[]; dueTotal: number; paid: GoodsEntry[] };
  unpaidItems: { kind: "court" | "gamezone"; code: string; date: string; time: string; amount: number; status: string; method: string; bulk: string | null }[];
  wheelchair: { code: string; date: string; time: string; people: number; status: string; note: string | null; bookingCode: string | null }[];
  insurance: { code: string; severity: string; status: string; patientName: string; createdAt: string; open: boolean }[];
};
export type GoodsEntry = { id: string; items: string; amount: number; lines: { label: string; quantity: number; amount: number }[]; createdAt: string; status: "due" | "paid"; source: string; by: string | null; paidAt: string | null; paidBy: string | null; checkoutCode: string | null };
export type DigitalView = { profile: Profile; extras: Extras };
export type CardData = { name: string; phone: string; payload: string; whatsapp: string; club?: { member: boolean; validUntil: string | null } };

export const resolveCode = (code: string) => api<{ phone: string; name: string | null }>("/admin/digital-id/resolve", { method: "POST", body: JSON.stringify({ code }) });
export const searchCustomers = (q: string) => api<Found[]>(`/admin/digital-id/search?q=${encodeURIComponent(q)}`);
export const loadDigital = (phone: string) => api<DigitalView>(`/admin/digital-id/${encodeURIComponent(phone)}`);
export const loadCard = (phone: string) => api<CardData>(`/admin/digital-id/${encodeURIComponent(phone)}/card`);
export const markAttendance = (phone: string) => api<{ alreadyMarked: boolean; date: string }>(`/admin/digital-id/${encodeURIComponent(phone)}/attendance`, { method: "POST", body: "{}" });
