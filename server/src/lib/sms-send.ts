// Sends a text from the admin server (login details of a customer staff have just added) and writes it to SmsLog.
// Same two senders as the customer backend (services/sms.service.ts there), chosen by SMS_PROVIDER:
//   "android" : SMS Gateway for Android in cloud mode (a phone with the venue SIM sends the text)
//   "sparrow" : Sparrow SMS bulk gateway (the default)
// Use the same SMSGATE_* / SPARROW_* values in this server's environment as in the customer backend.
import { prisma } from "../db";

export type SmsKind = "login_details";

const provider = () => ((process.env.SMS_PROVIDER || "sparrow").toLowerCase() === "android" ? "android" : "sparrow");

// Nepal numbers are stored as 98XXXXXXXX; the Android gateway wants +97798XXXXXXXX
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("977")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+977${digits.replace(/^0+/, "")}`;
}

/** True when the server has what it needs to send (the keys of the chosen gateway). */
export function smsConfigured(): boolean {
  if (provider() === "android") return !!(process.env.SMSGATE_USERNAME && process.env.SMSGATE_PASSWORD);
  return !!(process.env.SPARROW_SMS_TOKEN && process.env.SPARROW_SMS_IDENTITY);
}

type Outcome = { ok: boolean; id?: string; error?: string };

async function viaAndroid(phone: string, message: string): Promise<Outcome> {
  try {
    const url = (process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");
    const sim = Number(process.env.SMSGATE_SIM || 0);
    const body: Record<string, unknown> = {
      textMessage: { text: message },
      phoneNumbers: [toE164(phone)],
      ttl: Number(process.env.SMSGATE_TTL_SECONDS || 86400),
      withDeliveryReport: true,
    };
    if (sim >= 1 && sim <= 3) body.simNumber = sim;
    const res = await fetch(`${url}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${process.env.SMSGATE_USERNAME}:${process.env.SMSGATE_PASSWORD}`).toString("base64")}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
    if (res.status === 200 || res.status === 201 || res.status === 202) return { ok: true, id: data.id };
    return { ok: false, error: `Gateway error ${res.status}: ${data.message || data.error || "Unknown error"}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function viaSparrow(phone: string, message: string): Promise<Outcome> {
  try {
    const params = new URLSearchParams({ token: process.env.SPARROW_SMS_TOKEN || "", from: process.env.SPARROW_SMS_IDENTITY || "", to: phone, text: message });
    const res = await fetch(`http://api.sparrowsms.com/v2/sms/?${params.toString()}`, { method: "GET", signal: AbortSignal.timeout(15000) });
    const data = (await res.json()) as { response?: string; response_code?: number };
    if (res.ok && data.response_code === 200) return { ok: true };
    return { ok: false, error: `Sparrow: ${data.response || "Unknown error"} (${data.response_code})` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Sends one text and writes the SmsLog row. Never throws: the result says what happened. */
export async function sendSms(o: { phone: string; message: string; kind: SmsKind; name?: string | null; logMessage?: string }): Promise<Outcome> {
  const out: Outcome = smsConfigured()
    ? provider() === "android" ? await viaAndroid(o.phone, o.message) : await viaSparrow(o.phone, o.message)
    : { ok: false, error: "The SMS gateway is not set up on this server (see SMS_PROVIDER and SMSGATE_* in its environment)" };
  try {
    await prisma.smsLog.create({
      data: {
        phoneNumber: o.phone, recipientName: o.name ?? null, kind: o.kind, message: (o.logMessage ?? o.message).slice(0, 1000),
        status: out.ok ? "queued" : "failed", provider: provider(), providerId: out.id ?? null, error: out.ok ? null : (out.error ?? "Unknown error").slice(0, 300),
      },
    });
  } catch { /* the log is a record, never a reason to fail a text */ }
  return out;
}
