import { api } from "./api";

export type WStatus = "pending" | "confirmed" | "completed" | "declined" | "cancelled";

export type WRequest = {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  people: number;
  note: string | null;
  bookingCode: string | null;
  status: WStatus;
  staffReply: string | null;
  createdAt: string;
  updatedAt: string;
  customerPhone: string;
  customerName: string | null;
};

export type WList = { items: WRequest[]; total: number; page: number; limit: number };
export type WCounts = Record<"all" | WStatus, number>;

export const PAGE_SIZE = 20;

export const STATUS: Record<WStatus, { label: string; tone: string }> = {
  pending: { label: "New", tone: "bg-amber-500/15 text-amber-600" },
  confirmed: { label: "Confirmed", tone: "bg-emerald-500/15 text-emerald-600" },
  completed: { label: "Done", tone: "bg-brand/15 text-brand" },
  declined: { label: "Declined", tone: "bg-red-500/15 text-red-600" },
  cancelled: { label: "Cancelled by customer", tone: "bg-slate-500/15 text-slate-500" },
};

export const listRequests = (p: { status: WStatus | ""; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<WList>(`/admin/wheelchair?${qs}`);
};
export const requestCounts = () => api<WCounts>("/admin/wheelchair/counts");
export const updateRequest = (id: string, b: { status?: WStatus; reply?: string }) =>
  api<WRequest>(`/admin/wheelchair/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });

export const QUICK_REPLIES = [
  "The ramp and a court-side space will be ready for you. See you soon!",
  "A staff member will meet you at the entrance to help.",
  "Please call us on the venue number so we can plan this together.",
];

export const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const clock = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`; };
