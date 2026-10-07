import { api } from "./api";

export type GzSession = {
  id: string; code: string; consoleId: string; consoleName: string; gameTitle: string;
  date: string; startHour: number; hours: number; players: number; total: number;
  paymentMethod: string; paymentStatus: string; status: string;
  customerName: string | null; customerPhone: string | null; registered: boolean; checkedInAt: string | null; createdAt: string;
};
export type GzConsoleRow = { id: string; name: string; active: boolean };
export type GzDay = {
  date: string; consoles: GzConsoleRow[]; items: GzSession[];
  totals: { sessions: number; hours: number; cancelled: number; paid: number; owed: number };
};
export type GzList = { items: GzSession[]; total: number; page: number; limit: number };
export type GzScope = "today" | "upcoming" | "previous" | "unpaid";

export const PAGE_SIZE = 20;

export const getGzDay = (date: string) => api<GzDay>(`/admin/gamezone/day?date=${date}`);

export function listGzSessions(p: { scope: GzScope; page: number; q: string }) {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.scope === "unpaid") qs.set("unpaid", "1");
  else qs.set("scope", p.scope);
  if (p.q) qs.set("q", p.q);
  return api<GzList>(`/admin/gamezone/bookings?${qs}`);
}

const post = (code: string, action: "mark-paid" | "complete" | "cancel") => api(`/admin/gamezone/bookings/${encodeURIComponent(code)}/${action}`, { method: "POST" });
export const markGzPaid = (code: string) => post(code, "mark-paid");
export const completeGz = (code: string) => post(code, "complete");
export const cancelGz = (code: string) => post(code, "cancel");

export const STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "bg-blue-500/15 text-blue-600" },
  completed: { label: "Completed", tone: "bg-brand/15 text-brand" },
  cancelled: { label: "Cancelled", tone: "bg-red-500/15 text-red-600" },
  expired: { label: "Expired", tone: "bg-slate-500/15 text-slate-500" },
};

export const PAY: Record<string, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-brand/15 text-brand" },
  pay_at_venue: { label: "Pay at venue", tone: "bg-amber-500/15 text-amber-600" },
  pending: { label: "Unpaid", tone: "bg-amber-500/15 text-amber-600" },
  refunded: { label: "Refund due", tone: "bg-red-500/15 text-red-600" },
};

export const owes = (s: GzSession) => (s.status === "confirmed" || s.status === "completed") && (s.paymentStatus === "pending" || s.paymentStatus === "pay_at_venue");
export const canClose = (s: GzSession) => s.status === "confirmed";
export const canCancel = (s: GzSession) => s.status === "confirmed";

const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;
export const timeSpan = (s: { startHour: number; hours: number }) => `${h12(s.startHour)} – ${h12(s.startHour + s.hours)}`;
