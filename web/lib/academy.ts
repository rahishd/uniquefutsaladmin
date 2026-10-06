import { api } from "./api";

export type AStatus = "confirmed" | "cancelled" | "attended" | "no_show";

export type AClass = {
  id: string; title: string; date: string; startTime: string; endTime: string; coach: string | null;
  capacity: number; visible: boolean; status: "open" | "cancelled"; enrolled: number; seatsLeft: number; started: boolean;
};

export type AEnrollment = {
  id: string; code: string; status: AStatus; childName: string; childAge: number; healthStatus: "healthy" | "condition"; healthNotes: string | null;
  guardianName: string; guardianPhone: string; emergencyPhone: string; address: string; termsVersion: number; termsAcceptedAt: string; createdAt: string; cancelledBy: string | null;
  session: { id: string; title: string; date: string; startTime: string; endTime: string; status: string; started: boolean };
};

export type AList = { items: AEnrollment[]; total: number; page: number; limit: number };
export type AOverview = { upcomingClasses: number; visibleClasses: number; enrolledChildren: number; withHealthNotes: number };
export type ATerms = { version: number; text: string; updatedAt: string | null; updatedBy?: string | null; history?: ATerms[] };

export const PAGE_SIZE = 25;

export const STATUS: Record<AStatus, { label: string; tone: string }> = {
  confirmed: { label: "Enrolled", tone: "bg-brand/15 text-brand" },
  attended: { label: "Attended", tone: "bg-blue-500/15 text-blue-600" },
  no_show: { label: "No-show", tone: "bg-amber-500/15 text-amber-600" },
  cancelled: { label: "Cancelled", tone: "bg-slate-500/15 text-slate-500" },
};

export const overview = () => api<AOverview>("/admin/academy/overview");
export const listClasses = (scope: "upcoming" | "past") => api<AClass[]>(`/admin/academy/sessions?scope=${scope}`);
export const addClass = (b: { date: string; startTime: string; endTime: string; title?: string; coach?: string; capacity: number; visible: boolean; repeatWeeks: number }) =>
  api<AClass[]>("/admin/academy/sessions", { method: "POST", body: JSON.stringify(b) });
export const editClass = (id: string, b: Partial<{ title: string; coach: string | null; capacity: number; visible: boolean; date: string; startTime: string; endTime: string }>) =>
  api<AClass>(`/admin/academy/sessions/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const cancelClass = (id: string, reason: string) => api<{ cancelledEnrollments: number }>(`/admin/academy/sessions/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason || undefined }) });

export const listEnrollments = (p: { sessionId?: string; status?: string; health?: string; q?: string; page: number }) => {
  const qs = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE) });
  if (p.sessionId) qs.set("sessionId", p.sessionId);
  if (p.status) qs.set("status", p.status);
  if (p.health) qs.set("health", p.health);
  if (p.q?.trim()) qs.set("q", p.q.trim());
  return api<AList>(`/admin/academy/enrollments?${qs}`);
};
export const markAttendance = (id: string, status: "attended" | "no_show" | "confirmed") => api<AEnrollment>(`/admin/academy/enrollments/${id}/attendance`, { method: "POST", body: JSON.stringify({ status }) });
export const cancelEnrollment = (id: string) => api<AEnrollment>(`/admin/academy/enrollments/${id}/cancel`, { method: "POST" });

export const getTerms = () => api<ATerms>("/admin/academy/terms");
export const saveTerms = (text: string) => api<ATerms>("/admin/academy/terms", { method: "PUT", body: JSON.stringify({ text }) });

export function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
