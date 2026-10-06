import { api } from "./api";

// Fonepay dynamic QR made by the server for an exact amount. The same calls work with the test provider (fake QR + a simulate button)
// and with the real Fonepay later; the screens do not change.
export type QrStatus = "pending" | "paid" | "failed" | "expired";

export type FonepayQr = {
  id: string; prn: string; amount: number; remarks: string; status: QrStatus; expiresAt: string; paidAt: string | null; reference: string | null; used: boolean;
  mode: "test" | "live"; qrPayload?: string; qrImage?: string;
};

export const createQr = (b: { amount: number; customerPhone?: string; purpose?: string }) => api<FonepayQr>("/admin/fonepay/qr", { method: "POST", body: JSON.stringify(b) });
export const getQr = (id: string) => api<FonepayQr>(`/admin/fonepay/qr/${id}`);
export const cancelQr = (id: string) => api<FonepayQr>(`/admin/fonepay/qr/${id}/cancel`, { method: "POST", body: "{}" });
// TEST mode only: plays the gateway ("the customer paid")
export const simulatePaid = (id: string) => api<FonepayQr>(`/admin/fonepay/qr/${id}/simulate-paid`, { method: "POST", body: "{}" });
