import { api } from "./api";

type Money = { cash: number; fonepay: number; total: number };
export type Overview = {
  date: string; from: string; to: string; days: number; today: Money; yesterday: Money; week: ({ date: string } & Money)[];
  bySource: { games: { cash: number; fonepay: number }; goods: { cash: number; fonepay: number }; gamezone: { cash: number; fonepay: number }; tournaments?: { cash: number; fonepay: number } };
  games: { count: number; paid: number; unpaid: number }; gamezone: number; itemsSold: number; newCustomers: number;
  attention: { unpaidGamesToday: number; goodsDue: { amount: number; count: number }; lowStock: number; membersWaiting: number; membersExpiring: number; openComplaints: number; pendingReferrals: number; disputes: number };
  visits: { visitors: number; pageViews: number; signedIn: number; previous: number };
  nextGames: { id: string; code: string | null; startTime: string; customerName: string | null; totalPrice: number; paymentStatus: string }[];
};
export const getOverview = (from: string, to: string) => api<Overview>(`/admin/overview?from=${from}&to=${to}`);

export type VisitRow = {
  id: string; day: string; firstAt: string; lastAt: string; pages: number; registered: boolean;
  name: string | null; phone: string | null;
  ip: string | null; city: string | null; region: string | null; country: string | null;
  deviceType: string | null; deviceName: string | null; os: string | null; browser: string | null;
};
export const getVisits = (from: string, to: string) => api<{ total: number; items: VisitRow[] }>(`/admin/overview/visits?from=${from}&to=${to}`);
