// Fonepay dynamic QR, behind ONE interface, so the real gateway can be plugged in later without touching the screens or the money logic.
//
//   Today  : the TEST provider makes a clearly fake QR and a "simulate payment" call plays the gateway.
//   Later  : fill in LiveFonepayProvider with the real API (create QR, check status, verify the callback). Nothing else changes.
//
// Rules that stay the same with the real gateway:
//   - a QR is made by this server for an exact amount, with a unique PRN (payment reference number);
//   - it is "paid" only when the gateway says so (callback or status check), never because staff or the browser say so;
//   - a paid QR can be used ONCE, for exactly its amount, to settle a bill (see lib/settle.ts).
import { randomInt } from "crypto";
import QRCode from "qrcode";
import { env } from "../config/env";
import { AppError } from "./http";

export type QrState = "pending" | "paid" | "failed" | "expired";

export interface QrRequest {
  prn: string; // unique payment reference we send to the gateway
  amount: number; // whole rupees
  remarks: string; // shown to the customer in their payment app
  expiresAt: Date;
}
export interface QrResult {
  payload: string; // the text encoded in the QR
  providerRef: string | null; // the gateway's own id, if it gives one
}
export interface QrStatus {
  state: QrState;
  paidAmount?: number;
  reference?: string; // the gateway's transaction id
}

export interface FonepayProvider {
  mode: "test" | "live";
  createQr(r: QrRequest): Promise<QrResult>;
  // Ask the gateway where a payment stands (the live provider calls the Fonepay status API).
  checkStatus(prn: string, local: { state: QrState; paidAmount?: number; reference?: string }): Promise<QrStatus>;
  // Check the signature of a gateway callback and say which payment it is about. Throws if it is not genuine.
  verifyCallback(headers: Record<string, unknown>, body: unknown): { prn: string; paidAmount: number; reference: string };
}

class TestFonepayProvider implements FonepayProvider {
  mode = "test" as const;
  async createQr(r: QrRequest): Promise<QrResult> {
    return { payload: `FONEPAY-TEST|PRN=${r.prn}|AMT=${r.amount}|REM=${r.remarks}`, providerRef: null };
  }
  // There is no gateway: the status is whatever "simulate payment" recorded
  async checkStatus(_prn: string, local: { state: QrState; paidAmount?: number; reference?: string }): Promise<QrStatus> {
    return local;
  }
  verifyCallback(): never {
    throw new AppError(501, "Fonepay callbacks are not configured yet");
  }
}

// ---- TO FILL IN when the real Fonepay API details arrive ----
class LiveFonepayProvider implements FonepayProvider {
  mode = "live" as const;
  constructor(private cfg: { merchantCode: string; secret: string; baseUrl: string }) {}
  async createQr(_r: QrRequest): Promise<QrResult> {
    // POST {baseUrl}/... with merchantCode, PRN, amount, remarks and the signature (HMAC with cfg.secret); return the QR text from the response.
    throw new AppError(501, "Fonepay live mode is not implemented yet: add the real API call in LiveFonepayProvider.createQr");
  }
  async checkStatus(_prn: string): Promise<QrStatus> {
    // GET the payment status for this PRN from the Fonepay status API and map it to pending / paid / failed / expired.
    throw new AppError(501, "Fonepay live mode is not implemented yet: add the real API call in LiveFonepayProvider.checkStatus");
  }
  verifyCallback(_headers: Record<string, unknown>, _body: unknown): never {
    // Verify the gateway signature with cfg.secret, then return { prn, paidAmount, reference } from the payload.
    throw new AppError(501, "Fonepay live mode is not implemented yet: add the signature check in LiveFonepayProvider.verifyCallback");
  }
}

let cached: FonepayProvider | null = null;
export function getFonepay(): FonepayProvider {
  if (cached) return cached;
  if (env.FONEPAY_MODE === "live") {
    if (!env.FONEPAY_MERCHANT_CODE || !env.FONEPAY_SECRET || !env.FONEPAY_BASE_URL) throw new AppError(500, "Fonepay live mode needs FONEPAY_MERCHANT_CODE, FONEPAY_SECRET and FONEPAY_BASE_URL");
    cached = new LiveFonepayProvider({ merchantCode: env.FONEPAY_MERCHANT_CODE, secret: env.FONEPAY_SECRET, baseUrl: env.FONEPAY_BASE_URL });
  } else {
    cached = new TestFonepayProvider();
  }
  return cached;
}

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const makePrn = () => "UFQ" + Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const qrImage = (payload: string) => QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: "M" });
