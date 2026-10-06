import { api } from "./api";

type Money = { cash: number; fonepay: number; total: number };
export type Overview = {
  date: string; from: string; to: string; days: number; today: Money; yesterday: Money; week: ({ date: string } & Money)[];
  bySource: { games: { cash: number; fonepay: number }; goods: { cash: number; fonepay: number }; gamezone: { cash: number; fonepay: number } };
  games: { count: number; paid: number; unpaid: number }; gamezone: number; itemsSold: number; newCustomers: number;
  attention: { unpaidGamesToday: number; goodsDue: { amount: number; count: number }; lowStock: number; membersWaiting: number; membersExpiring: number; openComplaints: number; pendingReferrals: number; disputes: number };
  nextGames: { id: string; code: string | null; startTime: string; customerName: string | null; totalPrice: number; paymentStatus: string }[];
};
export const getOverview = (from: string, to: string) => api<Overview>(`/admin/overview?from=${from}&to=${to}`);
