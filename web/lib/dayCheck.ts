import { api } from "./api";

export type DayFigures = {
  cash: number;
  fonepay: number;
  total: number;
  bySource: Record<"games" | "goods" | "gamezone" | "tournaments", { cash: number; fonepay: number }>;
  games: number;
  gamesPaid: number;
  gamezone: number;
  itemsSold: number;
  dueAmount: number;
  dueCount: number;
};

export type DayCheckRecord = {
  day: string;
  expectedCash: number;
  expectedFonepay: number;
  receivedCash: number;
  receivedFonepay: number;
  differenceCash: number;
  differenceFonepay: number;
  difference: number;
  note: string | null;
  checkedByName: string;
  checkedAt: string;
};

export type DayCheckView = {
  date: string;
  figures: DayFigures;
  check: DayCheckRecord | null;
  changedSinceCheck: boolean;
  history: { day: string; checked: boolean; difference: number | null; checkedByName: string | null }[];
};

export const getDayCheck = (date?: string) => api<DayCheckView>(`/admin/day-check${date ? `?date=${date}` : ""}`);
export const markDayChecked = (b: { date: string; receivedCash: number; receivedFonepay: number; note?: string }) =>
  api<DayCheckRecord>("/admin/day-check", { method: "POST", body: JSON.stringify(b) });
export const reopenDay = (date: string) => api<{ day: string }>(`/admin/day-check/${date}`, { method: "DELETE" });
