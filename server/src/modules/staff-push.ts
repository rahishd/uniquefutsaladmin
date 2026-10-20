// Alerts for staff while the admin portal is closed or the phone is asleep (Web Push). The browser registers a device here; a
// background loop then watches the same live feed the bell uses and pushes anything new to every registered staff device.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import env from "../config/env";
import { handler, parse, send } from "../lib/http";
import { effectivePermissions } from "../lib/permissions";
import { pushEnabled, pushToStaff } from "../lib/push";
import { pushDueReminders } from "./reminders";
import { buildActivity, Item } from "./activity";

export const staffPushRouter = Router();

staffPushRouter.get("/push/public-key", handler(async (_req, res) => {
  send(res, { enabled: pushEnabled(), publicKey: pushEnabled() ? env.VAPID_PUBLIC_KEY : "" });
}));

const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

staffPushRouter.post("/push/subscribe", handler(async (req, res) => {
  const b = parse(subSchema, req.body);
  const data = { staffId: req.staff!.id, p256dh: b.keys.p256dh, auth: b.keys.auth, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200) || null };
  await prisma.staffPushSubscription.upsert({ where: { endpoint: b.endpoint }, create: { endpoint: b.endpoint, ...data }, update: data });
  send(res, { ok: true });
}));

staffPushRouter.post("/push/unsubscribe", handler(async (req, res) => {
  const b = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
  await prisma.staffPushSubscription.deleteMany({ where: { endpoint: b.endpoint, staffId: req.staff!.id } });
  send(res, { ok: true });
}));

// a test alert to this staff member's own devices
staffPushRouter.post("/push/test", handler(async (req, res) => {
  const n = await pushToStaff(req.staff!.id, { title: "Test alert", body: "Alerts reach this device even when the portal is closed.", href: "/dashboard", tag: "uf-test", urgent: true });
  send(res, { devices: n });
}));

const withHl = (i: Item) => `${i.href}${i.href.includes("?") ? "&" : "?"}hl=${encodeURIComponent(i.ref ?? i.id)}`;
const pushed = new Map<string, Set<string>>(); // staff id -> feed ids already announced (so nothing is pushed twice)

/** One pass: push whatever is new in each registered staff member's feed. The first pass for someone only remembers what exists. */
export async function pushNewActivity(now = new Date()): Promise<number> {
  if (!pushEnabled()) return 0;
  const ids = (await prisma.staffPushSubscription.findMany({ distinct: ["staffId"], select: { staffId: true } })).map((r) => r.staffId);
  let total = 0;
  for (const id of ids) {
    const s = await prisma.staffUser.findUnique({ where: { id } });
    if (!s || !s.isActive) continue;
    const permissions = effectivePermissions(s) as string[];
    if (!permissions.includes("dashboard.view")) continue;
    const items = await buildActivity({ id, permissions }, new Date(now.getTime() - 3_600_000));
    const known = pushed.get(id);
    pushed.set(id, new Set(items.map((i) => i.id).concat([...(known ?? [])]).slice(0, 400)));
    if (!known) continue;
    const fresh = items.filter((i) => !known.has(i.id) && !i.id.startsWith("s-")); // only customer activity alerts staff devices
    if (fresh.length === 0) continue;
    const orders = fresh.some((i) => i.type === "order" || i.title.includes("EMERGENCY"));
    if (fresh.length <= 3) {
      for (const i of fresh) { await pushToStaff(id, { title: i.title, body: i.text, href: withHl(i), tag: i.id, urgent: i.type === "order" }); total++; }
    } else {
      await pushToStaff(id, { title: `${fresh.length} new notifications`, body: fresh.slice(0, 3).map((i) => i.title).join(", "), href: "/dashboard", tag: "uf-many", urgent: orders });
      total++;
    }
  }
  return total;
}

export function startStaffPushWatcher(everyMs = 20_000) {
  const t = setInterval(() => { void pushNewActivity().catch(() => {}); void pushDueReminders().catch(() => {}); }, everyMs);
  t.unref();
  return t;
}
