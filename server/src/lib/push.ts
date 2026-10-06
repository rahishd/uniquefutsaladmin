import webpush from "web-push";
import { prisma } from "../db";
import env from "../config/env";

export type PushPayload = { title: string; body: string; href?: string; tag?: string };
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSender = (sub: Sub, payload: string) => Promise<unknown>;

const realSender: PushSender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600 });
let sender: PushSender = realSender;
let forced = false;
let configured = false;

// Test seam: capture pushes without a real push service (and without VAPID keys).
export const setPushSender = (s: PushSender | null) => { sender = s ?? realSender; forced = !!s; };

export const pushEnabled = () => forced || Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

function configure() {
  if (configured || forced) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

// Sends one alert to every saved device of the given customers (callers have already applied opt-outs).
// Never throws; dead devices (404/410) are removed. Returns how many customers got it on at least one device.
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<{ customers: number; devices: number }> {
  if (!pushEnabled() || userIds.length === 0) return { customers: 0, devices: 0 };
  try {
    configure();
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const body = JSON.stringify(payload);
    const reached = new Set<string>();
    let devices = 0;
    let next = 0;
    const worker = async () => {
      while (next < subs.length) {
        const s = subs[next++];
        try {
          await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
          reached.add(s.userId);
          devices++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
    return { customers: reached.size, devices };
  } catch {
    return { customers: 0, devices: 0 };
  }
}
