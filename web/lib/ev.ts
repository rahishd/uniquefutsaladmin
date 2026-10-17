import { api } from "./api";
import { BASE_PATH } from "./base";

export type EvStatus = "charging" | "unpaid" | "paid" | "cancelled";
export type EvCharge = {
  id: string; customerName: string | null; phone: string | null; vehicle: string | null; hours: number; rate: number; amount: number; cashAmount: number; onlineAmount: number; createdAt: string;
  status: EvStatus; source: "app" | "staff"; port: string | null; portId: string | null; startedAt: string | null; endedAt: string | null; paidAt: string | null; minutes: number;
};
export type EvTotals = { count: number; hours: number; amount: number; cash: number; online: number };
export type EvList = {
  rate: number; items: EvCharge[]; total: number; page: number; limit: number;
  summary: { today: EvTotals; last30: EvTotals; all: EvTotals }; active: EvCharge[]; unpaid: { count: number; amount: number };
};
export type EvProvider = "manual" | "webhook";
export type EvPort = {
  id: string; name: string; note: string | null; qrToken: string; isActive: boolean; busy: boolean; startedAt: string | null; customerName: string | null;
  provider: EvProvider; webhookUrl: string; deviceId: string; hasSecret: boolean;
};
export type PortControl = { provider?: EvProvider; webhookUrl?: string; webhookSecret?: string; deviceId?: string };

type PayArgs = { payment?: "cash" | "online"; payments?: { method: "cash" | "fonepay"; amount: number }[]; fonepayQrId?: string };

export const listEv = (q = "", status = "") => api<EvList>(`/admin/ev-charging?q=${encodeURIComponent(q)}&status=${status}&limit=50`);
export const recordEv = (b: PayArgs & { customerName?: string; phone?: string; vehicle?: string; portId?: string; hours: number }) =>
  api<EvCharge>("/admin/ev-charging", { method: "POST", body: JSON.stringify(b) });
export const stopEv = (id: string) => api(`/admin/ev-charging/${id}/stop`, { method: "POST", body: "{}" });
export const payEv = (id: string, b: PayArgs) => api(`/admin/ev-charging/${id}/pay`, { method: "POST", body: JSON.stringify(b) });
export const cancelEv = (id: string) => api(`/admin/ev-charging/${id}/cancel`, { method: "POST", body: "{}" });

export const listPorts = () => api<EvPort[]>("/admin/ev-charging/ports");
export const addPort = (b: { name: string; note?: string } & PortControl) => api<EvPort>("/admin/ev-charging/ports", { method: "POST", body: JSON.stringify(b) });
export const editPort = (id: string, b: { name?: string; note?: string; isActive?: boolean; newQr?: boolean } & PortControl) => api<EvPort>(`/admin/ev-charging/ports/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const testPort = (id: string, action: "on" | "off") => api(`/admin/ev-charging/ports/${id}/test`, { method: "POST", body: JSON.stringify({ action }) });
export const deletePort = (id: string) => api(`/admin/ev-charging/ports/${id}`, { method: "DELETE" });

// The QR at a port is a link into the CUSTOMER site (not the API): a phone camera opens it, and the in-app scanner reads the same text.
// Same rule as the tournament links: set NEXT_PUBLIC_CUSTOMER_SITE; in production both sites share one domain; locally it is port 3000.
export const portLink = (token: string) => {
  const env = process.env.NEXT_PUBLIC_CUSTOMER_SITE;
  const origin = env ? env : typeof window === "undefined" ? "" : BASE_PATH ? window.location.origin : "http://localhost:3000";
  return `${origin.replace(/\/+$/, "")}/ev?port=${token}`;
};

export const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
