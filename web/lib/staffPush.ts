// Alerts while the portal is closed or the phone is asleep (Web Push). The browser keeps a subscription; the admin server pushes
// new activity to it. The sound of a closed-app alert is the device's own notification sound (a web page cannot play its own sound
// when it is not open), so the custom alert sound only plays while the portal is open.
import { api } from "./api";

export type PushState = "unsupported" | "denied" | "off" | "on" | "unavailable";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register("/admin-sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready);
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch { return "off"; }
}

/** Asks permission (must come from a click), subscribes this device and tells the server. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const key = await api<{ enabled: boolean; publicKey: string }>("/admin/push/public-key");
  if (!key.enabled) return "unavailable";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) }));
  await api("/admin/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await api("/admin/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

/** Keeps the server's copy fresh on each visit (a signed-out then signed-in staff member re-links this device). */
export async function resyncPush() {
  if (!supported() || Notification.permission !== "granted") return;
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) await api("/admin/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  } catch { /* offline or signed out */ }
}

export const sendTestPush = () => api<{ devices: number }>("/admin/push/test", { method: "POST", body: "{}" });
