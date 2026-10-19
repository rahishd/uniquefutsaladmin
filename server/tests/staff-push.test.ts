import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { setPushSender } from "../src/lib/push";
import { pushNewActivity } from "../src/modules/staff-push";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

const sent: { endpoint: string; payload: { title: string; body: string; href: string } }[] = [];
const clean = async () => { await reset(); await prisma.staffPushSubscription.deleteMany(); };
before(async () => { await clean(); setPushSender(async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); }); });
beforeEach(async () => { await clean(); sent.length = 0; });
after(async () => { setPushSender(null); await clean(); await prisma.$disconnect(); });

const sub = (n = 1) => ({ endpoint: `https://push.example.test/device-${n}`, keys: { p256dh: "p256dh-key", auth: "auth-key" } });
const booking = () =>
  prisma.booking.create({ data: { userId: "9880000001", customerName: "Raju", date: todayKey(), startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "fonepay", status: "confirmed", source: "app" } as never });

describe("Staff alerts while the portal is closed", () => {
  it("saves a device, and pushes only what is new after the first pass", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    assert.equal((await api.post("/push/subscribe", owner.auth, sub())).status, 200);
    assert.equal(await prisma.staffPushSubscription.count(), 1);
    assert.equal((await api.post("/push/subscribe", owner.auth, sub())).status, 200, "the same device again is not a second copy");
    assert.equal(await prisma.staffPushSubscription.count(), 1);

    await booking(); // already there before the first pass: remembered, not announced
    await pushNewActivity();
    assert.equal(sent.length, 0);

    await prisma.complaint.create({ data: { code: "CP-9", userId: "9880000001", category: "Court", message: "The floor is wet" } });
    await pushNewActivity();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.title, "New complaint");
    assert.match(sent[0].payload.href, /^\/complaints\?hl=/);

    await pushNewActivity();
    assert.equal(sent.length, 1, "nothing is announced twice");
  });

  it("sends a test alert to their device and refuses a bad subscription", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    await api.post("/push/subscribe", owner.auth, sub());
    assert.equal((await api.post("/push/test", owner.auth)).body.data.devices, 1);
    assert.equal(sent[0].payload.title, "Test alert");
    assert.equal((await api.post("/push/subscribe", owner.auth, { endpoint: "nope", keys: {} })).status, 400);
  });

  it("removes a device when asked", async () => {
    const owner = await staff("owner");
    await api.post("/push/subscribe", owner.auth, sub());
    assert.equal((await api.post("/push/unsubscribe", owner.auth, { endpoint: sub().endpoint })).status, 200);
    assert.equal(await prisma.staffPushSubscription.count(), 0);
  });
});
