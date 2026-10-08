import { api } from "./api";

export type SlotBooking = {
  id: string;
  code: string;
  customerName: string | null;
  customerPhone: string | null;
  userId: string | null;
  status: string;
  paymentStatus: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: number;
  source: string;
  notes: string | null;
  promoCode: string | null;
  discountAmount: number;
  voucherId: string | null;
};

export type Hour = {
  hour: number;
  price: number;
  state: "free" | "booked" | "blocked";
  block: { id: string; reason: string } | null;
  booking: SlotBooking | null;
  member?: { userId: string; name: string | null; memberCode: string | null } | null; // a membership holds this hour
};

export const getDay = (date: string) => api<{ date: string; hours: Hour[] }>(`/admin/courts/slots?date=${date}`);

export type WalkInInput = {
  date: string;
  startTime: string;
  duration: number;
  customerName: string;
  customerPhone?: string;
  paymentMethod: "venue" | "fonepay";
  paid: boolean;
  priceOverride?: number;
  notes?: string;
};

export const bookManually = (b: WalkInInput) => api("/admin/bookings/walk-in", { method: "POST", body: JSON.stringify(b) });
export type BulkPlan = { plan: { date: string; free: boolean; price: number }[]; requested: number; free: number; taken: number; pricePerGame: number; totalAmount: number };
export type BulkInput = Omit<WalkInInput, "date"> & { dates: string[]; mode: "free" | "all"; dryRun?: boolean };
export type BulkResult = BulkPlan & { created?: { id: string; code: string; date: string }[]; skipped?: string[] };
export const bulkBook = (b: BulkInput) => api<BulkResult>("/admin/bookings/walk-in/bulk", { method: "POST", body: JSON.stringify(b) });
export const rejectBooking = (id: string) => api(`/admin/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });
export const findCustomer = (phone: string, limit = 1) =>
  api<{ items: { phoneNumber: string; name: string | null }[] }>(`/admin/customers?q=${encodeURIComponent(phone)}&limit=${limit}`);

// ---- date and time helpers (Nepal time, whatever the browser's time zone) ----
const nepalDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" });
const nepalHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", hourCycle: "h23" });

export const todayKey = () => nepalDate.format(new Date());
export const nowHour = () => Number(nepalHour.format(new Date()));

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric", year: "numeric" }).toUpperCase();

export const hourLabel = (h: number) => `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:00 ${h < 12 ? "AM" : "PM"}`;
export const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const OPEN_FROM = 5; // the grid shows 5 AM to 10 PM, plus any booked hour outside that
export const OPEN_TO = 22;
