import { api } from "./api";

export type GzSession = {
  id: string; code: string; consoleId: string; consoleName: string; gameTitle: string;
  date: string; startHour: number; hours: number; players: number; total: number;
  paymentMethod: string; paymentStatus: string; status: string;
  customerName: string | null; customerPhone: string | null; registered: boolean; checkedInAt: string | null; createdAt: string;
  clock: GzClock | null; // null until staff press Start
  due: number; // what is still to collect: the total, less anything paid before extra time was added
};
// Staff press Start: the booked hours run, and extra minutes are billed per minute when the session is stopped.
export type GzClock = { startedAt: string; endedAt: string | null; bookedMinutes: number; hourlyRate: number; extraMinutes: number; extraCharge: number };
export type GzConsoleRow = { id: string; name: string; active: boolean };
export type GzDay = {
  date: string; consoles: GzConsoleRow[]; items: GzSession[]; serverNow: string;
  totals: { sessions: number; hours: number; cancelled: number; paid: number; owed: number };
};
export type GzList = { items: GzSession[]; total: number; page: number; limit: number; serverNow: string };
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

export type GzManualInput = {
  consoleId: string; gameTitle: string; date: string; startHour: number; hours: number; players: number;
  customerName: string; customerPhone?: string; paid: boolean;
};
export type GzCustomer = { phoneNumber: string; name: string | null };
export const searchGzCustomers = (q: string) => api<{ items: GzCustomer[] }>(`/admin/gamezone/customers?q=${encodeURIComponent(q)}`);
export const createGzSession = (b: GzManualInput) => api<{ code: string; total: number }>("/admin/gamezone/bookings", { method: "POST", body: JSON.stringify(b) });

const post = (code: string, action: "mark-paid" | "complete" | "cancel") => api(`/admin/gamezone/bookings/${encodeURIComponent(code)}/${action}`, { method: "POST" });
export const markGzPaid = (code: string) => post(code, "mark-paid");
export const completeGz = (code: string) => api<{ extraMinutes: number; extraCharge: number; total: number }>(`/admin/gamezone/bookings/${encodeURIComponent(code)}/complete`, { method: "POST" });
export const cancelGz = (code: string) => post(code, "cancel");
export const startGz = (code: string) => api<GzClock>(`/admin/gamezone/bookings/${encodeURIComponent(code)}/start`, { method: "POST" });

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

export const isRunning = (s: GzSession) => s.status === "confirmed" && !!s.clock && !s.clock.endedAt;
// Payment waits until a running session is stopped, so the final bill (with any extra minutes) is known.
export const owes = (s: GzSession) => (s.status === "confirmed" || s.status === "completed") && (s.paymentStatus === "pending" || s.paymentStatus === "pay_at_venue") && !isRunning(s);
export const canStart = (s: GzSession, today: string) => s.status === "confirmed" && !s.clock && s.date === today;
export const canClose = (s: GzSession) => s.status === "confirmed";
export const canCancel = (s: GzSession) => s.status === "confirmed" && !s.clock; // a started session is stopped, not cancelled

const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;
export const timeSpan = (s: { startHour: number; hours: number }) => `${h12(s.startHour)} – ${h12(s.startHour + s.hours)}`;
