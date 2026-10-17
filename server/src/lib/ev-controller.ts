// Same file as the customer backend (src/modules/ev/ev.provider.ts): keep the two in step.
import { createHmac } from "crypto";
import { EvPort } from "@prisma/client";

// What switches a charging port on and off. The QR printed at the port never changes: it only names the port (its token). Which
// system turns the plug on is stored on the port (provider + providerConfig), so a port can start as "manual" (nobody is switched,
// the session is only recorded) and later be connected to a smart plug system without printing a new QR.
//
//   manual   nothing is switched; the session and bill are recorded.
//   webhook  an HTTPS call to your own bridge for every on and off (works for Tuya Smart Plugs through a small bridge, Home
//            Assistant, Node-RED, n8n, or any server). The body is signed so the bridge knows the call is from Unique Futsal.
//
// To add a vendor SDK (for example Tuya Cloud directly): write a `PortController` below and add it to CONTROLLERS. Nothing else changes.
export type Action = "on" | "off";
export interface SwitchContext {
  sessionId: string;
  customerName: string | null;
}
export interface PortController {
  label: string;
  /** Throws when the plug could not be switched. */
  switch(port: EvPort, action: Action, ctx: SwitchContext): Promise<void>;
}

export interface WebhookConfig {
  url?: string;
  secret?: string;
  deviceId?: string; // passed to the bridge as is (for example the Tuya device id)
}

export const parseConfig = (port: Pick<EvPort, "providerConfig">): WebhookConfig => {
  try { return JSON.parse(port.providerConfig ?? "{}") as WebhookConfig; } catch { return {}; }
};

const TIMEOUT_MS = 8000;

const manual: PortController = { label: "Manual (record only)", async switch() { /* nothing to switch */ } };

const webhook: PortController = {
  label: "Webhook (smart plug bridge)",
  async switch(port, action, ctx) {
    const cfg = parseConfig(port);
    if (!cfg.url || !/^https?:\/\//i.test(cfg.url)) throw new Error("The webhook address is not set for this port.");
    const body = JSON.stringify({
      event: "ev.charging", action, at: new Date().toISOString(), port: { id: port.id, name: port.name, deviceId: cfg.deviceId ?? null }, sessionId: ctx.sessionId, customerName: ctx.customerName,
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.secret) headers["X-UF-Signature"] = createHmac("sha256", cfg.secret).update(body).digest("hex");
    const res = await fetch(cfg.url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`The charger bridge answered ${res.status}.`);
  },
};

export const CONTROLLERS: Record<string, PortController> = { manual, webhook };
export const controllerFor = (port: Pick<EvPort, "provider">): PortController => CONTROLLERS[port.provider] ?? manual;
