import { api } from "./api";

export type Scope = "today" | "upcoming" | "previous";

export type Booking = {
  id: string;
  code: string;
  userId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  customerName: string | null;
  customerPhone: string | null;
  basePrice: number;
  discountAmount: number;
  totalPrice: number;
  promoCode: string | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  source: string;
  notes: string | null;
  voucherId: string | null;
  amountPaidNow: number;
  remainingAmount: number;
  checkedInAt: string | null;
  createdAt: string;
  cancelledAt: string | null;
};

export type BookingList = { items: Booking[]; total: number; page: number; limit: number };
export type BookingDetail = {
  booking: Booking;
  paymentOrder: { orderCode: string; status: string; method: string; amount: number; paidAt: string | null; expiresAt: string } | null;
  playerStats: { userId: string; goals: number; assists: number }[];
};

export const PAGE_SIZE = 20;

export const listBookings = (p: { scope: Scope; page: number; q: string; status: string }) => {
  const qs = new URLSearchParams({ scope: p.scope, page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.status) qs.set("status", p.status);
  return api<BookingList>(`/admin/bookings?${qs}`);
};

export const bookingCounts = () => api<Record<Scope, number>>("/admin/bookings/counts");
export const bookingDetail = (id: string) => api<BookingDetail>(`/admin/bookings/${encodeURIComponent(id)}`);

export type DueRow = { id: string; code: string; date: string; startTime: string; endTime: string; total: number; status: string; promoCode: string | null };
export type GoodsDueRow = { id: string; items: string; amount: number; createdAt: string };
export type DuesInfo = { goods: GoodsDueRow[]; goodsTotal: number; customer: { name: string | null; phone: string | null; registered: boolean; known: boolean }; current: DueRow & { owed: boolean }; past: DueRow[]; today: DueRow[]; upcoming: DueRow[]; pastTotal: number };
export const getDues = (id: string) => api<DuesInfo>(`/admin/bookings/${encodeURIComponent(id)}/dues`);
export const collectDues = (b: { anchorId: string; bookingIds: string[]; goodsDueIds: string[]; method?: "venue" | "fonepay"; payments?: { method: "cash" | "fonepay"; amount: number }[]; fonepayQrId?: string }) =>
  api<{ count: number; total: number; billCode: string | null; points: number; lines: { type: "game" | "goods"; label: string; quantity: number; amount: number }[] }>("/admin/bookings/collect-dues", { method: "POST", body: JSON.stringify(b) });

// ---- display helpers ----
export const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

export const prettyDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "bg-blue-500/15 text-blue-600" },
  pending: { label: "Pending", tone: "bg-amber-500/15 text-amber-600" },
  completed: { label: "Completed", tone: "bg-brand/15 text-brand" },
  cancelled: { label: "Cancelled", tone: "bg-red-500/15 text-red-600" },
  no_show: { label: "No-show", tone: "bg-red-500/15 text-red-600" },
  expired: { label: "Expired", tone: "bg-slate-500/15 text-slate-500" },
};

export const PAYMENT: Record<string, { label: string; tone: string }> = {
  completed: { label: "Paid", tone: "bg-brand/15 text-brand" },
  pending: { label: "Unpaid", tone: "bg-amber-500/15 text-amber-600" },
};

export const METHOD: Record<string, string> = { venue: "Pay at venue", fonepay: "Fonepay", esewa: "eSewa (old)", membership: "Membership" };

// Where the booking came from, shown as small tags.
export function tags(b: Booking): string[] {
  const t: string[] = [];
  if (b.notes?.includes("WALK_IN")) t.push("Walk-in");
  if (b.userId === null && !b.notes?.includes("WALK_IN")) t.push("Guest");
  if (b.voucherId || b.notes?.includes("FREE_MATCH")) t.push("Free game");
  if (b.source === "challenge") t.push("Challenge");
  if (b.checkedInAt) t.push("Checked in");
  return t;
}
