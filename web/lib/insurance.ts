import { api } from "./api";
export { ago, photoUrl } from "./complaints";

export type IStatus = "submitted" | "in_review" | "approved" | "rejected" | "closed";

export type Claim = {
  id: string; code: string; patientName: string; patientPhone: string; witnessName: string; witnessNameNe: string; witnessPhone: string | null;
  severity: "minor" | "emergency"; incidentDate: string; description: string | null; photos: string[]; status: IStatus; staffReply: string | null;
  decidedAt: string | null; createdAt: string; filerPhone: string; filerName: string | null;
  emergency: { name: string | null; phone: string; relation: string | null } | null;
};
export type IList = { items: Claim[]; total: number; page: number; limit: number };
export type ICounts = Record<"all" | IStatus, number>;

export const PAGE_SIZE = 20;

export const STATUS: Record<IStatus, { label: string; tone: string }> = {
  submitted: { label: "New", tone: "bg-amber-500/15 text-amber-600" },
  in_review: { label: "In review", tone: "bg-sky-500/15 text-sky-600" },
  approved: { label: "Approved", tone: "bg-emerald-500/15 text-emerald-600" },
  rejected: { label: "Rejected", tone: "bg-red-500/15 text-red-600" },
  closed: { label: "Closed", tone: "bg-slate-500/15 text-slate-500" },
};

export const listClaims = (p: { status: IStatus | ""; severity: string; q: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.status) qs.set("status", p.status);
  if (p.severity) qs.set("severity", p.severity);
  if (p.q.trim()) qs.set("q", p.q.trim());
  return api<IList>(`/admin/insurance?${qs}`);
};
export const claimCounts = () => api<ICounts>("/admin/insurance/counts");
export const updateClaim = (id: string, b: { status?: IStatus; reply?: string }) =>
  api<Claim>(`/admin/insurance/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });

export const QUICK_REPLIES = [
  "We have received your claim. Please bring the hospital bill and your ID to the front desk.",
  "Your claim is approved. We will contact you about the next step.",
  "We could not approve this claim. Please call the venue to talk it over.",
];
