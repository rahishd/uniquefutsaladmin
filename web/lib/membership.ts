import { api } from "./api";
import type { MLength, MShift } from "./courts";

export type MemberStatus = "pending" | "active" | "expiring" | "expired" | "suspended" | "cancelled";
export const STATUS_LABEL: Record<MemberStatus, string> = { pending: "Waiting for payment", active: "Active", expiring: "Expiring soon", expired: "Expired", suspended: "Suspended", cancelled: "Cancelled" };
export const STATUS_TONE: Record<MemberStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700", active: "bg-green-500/15 text-green-700", expiring: "bg-orange-500/15 text-orange-700",
  expired: "bg-red-500/15 text-red-700", suspended: "bg-violet-500/15 text-violet-700", cancelled: "bg-surface-2 text-muted",
};

export type Member = {
  id: string; memberCode: string | null; status: MemberStatus; rawStatus: string; paymentStatus: string;
  customer: { phone: string; name: string | null }; plan: { id: string; name: string };
  length: string | null; shift: MShift | null; timeSlot: string | null; days: string[];
  startDate: string; endDate: string; daysLeft: number | null; totalPrice: number; promoCode: string | null; notes: string | null;
  gamesPlayed?: number; pointsAdded?: number;
};
export type MemberList = {
  items: Member[]; total: number; page: number; limit: number; activeValue: number;
  counts: Record<"all" | MemberStatus, number>;
};
export type MemberDetail = Member & { earlier: Member[]; payments: { id: string; date: string; amount: number; cash: number; online: number; renewal: boolean; status: string }[] };

export const PAGE_SIZE = 25;
export type PayBody = { payments?: { method: "cash" | "fonepay"; amount: number }[]; single?: "cash" | "fonepay"; fonepayQrId?: string };

export const listMembers = (p: { status: "" | MemberStatus; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<MemberList>(`/admin/membership/subscriptions?${qs}`);
};
export const getMember = (id: string) => api<MemberDetail>(`/admin/membership/subscriptions/${id}`);

export type NewMember = { phone: string; planId: string; length: MLength; timeSlot: string; days: string[]; startDate: string; notes?: string; pay?: PayBody };
export type Preview = { price: number; discount: number; total: number; shift: MShift; startDate: string; endDate: string; dates: number; clashes: { date: string; reason: string }[] };
export const previewMember = (b: NewMember) => api<Preview>("/admin/membership/subscriptions", { method: "POST", body: JSON.stringify({ ...b, pay: undefined, dryRun: true }) });
export const createMember = (b: NewMember) => api<Member>("/admin/membership/subscriptions", { method: "POST", body: JSON.stringify(b) });
const post = (id: string, action: string, b: object = {}) => api<Member>(`/admin/membership/subscriptions/${id}/${action}`, { method: "POST", body: JSON.stringify(b) });
export const verifyMember = (id: string, pay: PayBody) => post(id, "verify", pay);
export const renewMember = (id: string, b: { length?: MLength; pay: PayBody }) => post(id, "renew", b);
export const extendMember = (id: string, b: { days: number; reason: string }) => post(id, "extend", b);
export const suspendMember = (id: string, reason: string) => post(id, "suspend", { reason });
export const resumeMember = (id: string) => post(id, "resume");
export const cancelMember = (id: string, reason: string) => post(id, "cancel", { reason });

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
// Membership hours: 5 AM to 10 PM, but 4 PM to 8 PM stays for ordinary bookings
export const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21];
export const hourSlot = (h: number) => `${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`;
export const shiftOfHour = (h: number): MShift => (h < 12 ? "morning" : h < 20 ? "day" : "evening");
export const h12 = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
export const slotLabel = (slot: string) => { const h = Number(slot.slice(0, 2)); return `${h12(h)} – ${h12(h + 1)}`; };
export const shortDate = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const lengthLabel = (l: string | null) => (l ? l.replace("_", " ") : "");
