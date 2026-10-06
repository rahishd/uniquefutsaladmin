import { api } from "./api";

export type CStatus = "open" | "in_review" | "resolved" | "closed";

export type Complaint = {
  id: string;
  code: string;
  category: string;
  categoryLabel: string;
  message: string;
  bookingCode: string | null;
  photos: string[];
  status: CStatus;
  staffReply: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  customerPhone: string;
  customerName: string | null;
  customerComplaints?: number; // detail only: how many complaints this customer has sent
};

export type CList = { items: Complaint[]; total: number; page: number; limit: number };
export type CCounts = Record<"all" | CStatus, number>;

export const PAGE_SIZE = 20;

export const CATEGORIES = [
  { id: "booking", label: "Booking" }, { id: "payment", label: "Payment or refund" }, { id: "facilities", label: "Court or facilities" },
  { id: "staff", label: "Staff behaviour" }, { id: "gamezone", label: "Gamezone" }, { id: "membership", label: "Membership" },
  { id: "app", label: "App problem" }, { id: "other", label: "Other" },
];

export const STATUS: Record<CStatus, { label: string; tone: string }> = {
  open: { label: "New", tone: "bg-amber-500/15 text-amber-600" },
  in_review: { label: "In review", tone: "bg-blue-500/15 text-blue-600" },
  resolved: { label: "Resolved", tone: "bg-brand/15 text-brand" },
  closed: { label: "Closed", tone: "bg-slate-500/15 text-slate-500" },
};

export const listComplaints = (p: { status: CStatus | ""; category: string; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.category) qs.set("category", p.category);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<CList>(`/admin/complaints?${qs}`);
};
export const complaintCounts = () => api<CCounts>("/admin/complaints/counts");
export const getComplaint = (id: string) => api<Complaint>(`/admin/complaints/${encodeURIComponent(id)}`);
export const updateComplaint = (id: string, b: { status?: CStatus; reply?: string }) =>
  api<Complaint>(`/admin/complaints/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });

// Photos live on the customer backend (`/uploads/...`) or are full cloud URLs.
const CUSTOMER_ORIGIN = (process.env.NEXT_PUBLIC_CUSTOMER_ORIGIN ?? "http://localhost:5000").replace(/\/+$/, "");
export const photoUrl = (p: string) => (/^https?:\/\//i.test(p) ? p : `${CUSTOMER_ORIGIN}${p}`);

export function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d < 30 ? `${d} day${d > 1 ? "s" : ""} ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const QUICK_REPLIES = [
  "We are sorry about this. We are looking into it and will update you soon.",
  "Thank you for telling us. We have fixed the problem.",
  "Please call us on the venue number so we can sort this out together.",
];
