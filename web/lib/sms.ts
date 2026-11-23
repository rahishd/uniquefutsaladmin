import { api } from "./api";

export type SmsLogRow = {
  id: string;
  createdAt: string;
  phoneNumber: string;
  recipientName: string | null;
  kind: string;
  kindLabel: string;
  message: string;
  status: "queued" | "failed";
  provider: string;
  providerId: string | null;
  error: string | null;
  bookingCode: string | null;
};

export type SmsLogs = {
  items: SmsLogRow[];
  total: number;
  page: number;
  pages: number;
  stats: { last24: number; week: number; failedWeek: number };
  kinds: { key: string; label: string }[];
};

export type SmsTemplate = {
  key: string;
  label: string;
  when: string;
  placeholders: { name: string; meaning: string; sample: string }[];
  defaultBody: string;
  body: string;
  custom: boolean;
  preview: string;
  maxLength: number;
};

export type SmsFilters = { q: string; kind: string; status: string; from: string; to: string; page: number };

export const listSms = (f: SmsFilters) => {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.kind) p.set("kind", f.kind);
  if (f.status) p.set("status", f.status);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  p.set("page", String(f.page));
  p.set("limit", "25");
  return api<SmsLogs>(`/admin/sms/logs?${p.toString()}`);
};
export const listTemplates = () => api<SmsTemplate[]>("/admin/sms/templates");
export const saveTemplate = (key: string, body: string) => api<SmsTemplate>(`/admin/sms/templates/${key}`, { method: "PUT", body: JSON.stringify({ body }) });
export const resetTemplate = (key: string) => api<SmsTemplate>(`/admin/sms/templates/${key}`, { method: "DELETE" });

// ---- mass messages ----

export type Audience = { key: string; label: string; description: string; count: number | null };
export type Audiences = { configured: boolean; max: number; maxLength: number; audiences: Audience[] };
export type Preview = { count: number; optedOut: number; invalid: number; sample: { phone: string; name: string }[]; tooMany: boolean };
export type Campaign = { id: string; createdAt: string; createdByName: string; title: string; body: string; audience: string; audienceLabel: string; total: number; sent: number; failed: number; status: "sending" | "done" | "stopped"; finishedAt: string | null; parts: number };

export const listAudiences = () => api<Audiences>("/admin/sms/audiences");
export const previewAudience = (audience: string, numbers: string) => api<Preview>("/admin/sms/campaigns/preview", { method: "POST", body: JSON.stringify({ audience, numbers }) });
export const startCampaign = (b: { audience: string; numbers: string; body: string; expected: number }) => api<Campaign>("/admin/sms/campaigns", { method: "POST", body: JSON.stringify(b) });
export const listCampaigns = () => api<Campaign[]>("/admin/sms/campaigns");
export const stopCampaign = (id: string) => api<{ id: string }>(`/admin/sms/campaigns/${id}/stop`, { method: "POST" });
export const sendTest = (body: string, phone: string) => api<{ phone: string }>("/admin/sms/campaigns/test", { method: "POST", body: JSON.stringify({ body, phone }) });

// ---- login details for new customers ----

export type NewCustomer = { phone: string; name: string | null; createdAt: string; active: boolean; age: number | null; detailsSentAt: string | null };
export type NewCustomers = { days: number; configured: boolean; items: NewCustomer[] };
export type LoginDetailsResult = { sent: number; failed: number; skipped: number; results: { phone: string; ok: boolean; error?: string }[] };

export const listNewCustomers = (days: number) => api<NewCustomers>(`/admin/sms/new-customers?days=${days}`);
export const sendLoginDetails = (phones: string[]) => api<LoginDetailsResult>("/admin/sms/login-details", { method: "POST", body: JSON.stringify({ phones }) });
