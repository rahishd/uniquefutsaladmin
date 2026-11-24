import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";
import { setPushSender } from "../src/lib/push";

before(reset);
beforeEach(reset);
after(async () => { setPushSender(null); await prisma.$disconnect(); });

// every push is caught here instead of going to a real push service
let pushes: { endpoint: string; title: string; body: string; href?: string }[] = [];
beforeEach(() => {
  pushes = [];
  setPushSender(async (sub, payload) => { const p = JSON.parse(payload); pushes.push({ endpoint: sub.endpoint, title: p.title, body: p.body, href: p.href }); });
});

const device = (userId: string, n = 1) => prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.example/${userId}/${n}`, p256dh: "p", auth: "a" } });
const booking = (userId: string, status: string, extra: object = {}) =>
  prisma.booking.create({ data: { userId, date: addDays(3), startTime: "18:00", endTime: "19:00", duration: 1, status, paymentMethod: "venue", paymentStatus: "pending", basePrice: 1000, subtotal: 1000, totalPrice: 1000, customerPhone: userId, customerName: "Sita Rai", code: `UF-T${Math.floor(Math.random() * 1e6)}`, ...extra } as never });
function addDays(n: number) { const d = new Date(Date.now() + n * 86400000 + 5.75 * 3600000); return d.toISOString().slice(0, 10); }

describe("Alerts that staff actions send to the customer's phone and watch", () => {
  it("a booking cancelled by staff reaches every saved device", async () => {
    const owner = await staff("owner");
    await customer("9802000001", "Sita Rai");
    await device("9802000001", 1);
    await device("9802000001", 2); // a phone and, say, a tablet
    const b = await booking("9802000001", "confirmed");
    const r = await api.post(`/bookings/${b.id}/cancel`, owner.auth, { reason: "Ground maintenance" });
    assert.equal(r.status, 200);
    assert.equal(pushes.length, 2);
    assert.ok(pushes.every((p) => /cancelled/i.test(p.title)));
    assert.equal(await prisma.notification.count({ where: { userId: "9802000001", type: "booking" } }), 1); // the bell row is still written
  });

  it("confirming a waiting booking sends Booking confirmed and Payment received, once each", async () => {
    const owner = await staff("owner");
    await customer("9802000002", "Ram Rai");
    await device("9802000002");
    const b = await booking("9802000002", "pending");
    assert.equal((await api.post(`/bookings/${b.id}/mark-paid`, owner.auth, { method: "venue" })).status, 200);
    const titles = pushes.map((p) => p.title).sort();
    assert.deepEqual(titles, ["Booking confirmed", "Payment received"]);
    assert.match(pushes.find((p) => p.title === "Booking confirmed")!.body, /18:00/);
    assert.equal(pushes.find((p) => p.title === "Booking confirmed")!.href?.startsWith("/booking/"), true);
  });

  it("points awarded by staff are pushed, and a customer with no saved device just gets the bell notice", async () => {
    const owner = await staff("owner");
    await customer("9802000003", "Hari Rai");
    await customer("9802000004", "No Phone");
    await device("9802000003");
    assert.equal((await api.post("/loyalty/adjust", owner.auth, { phone: "9802000003", points: 5, reason: "Thanks for playing" })).status < 300, true);
    assert.ok(pushes.some((p) => /points/i.test(p.title)));
    pushes = [];
    await api.post("/loyalty/adjust", owner.auth, { phone: "9802000004", points: 5, reason: "Thanks for playing" });
    assert.equal(pushes.length, 0);
    assert.equal(await prisma.notification.count({ where: { userId: "9802000004" } }), 1);
  });

  it("honours the customer's switch for promotional alerts", async () => {
    await customer("9802000005", "Opt Out");
    await device("9802000005");
    await prisma.userPrefs.create({ data: { userId: "9802000005", promoNotifications: false } });
    const { notify } = await import("../src/lib/customer-effects");
    await notify(prisma, { userId: "9802000005", type: "promo", title: "Big offer", message: "10% off" });
    assert.equal(pushes.length, 0);
    await notify(prisma, { userId: "9802000005", type: "booking", title: "Booking confirmed", message: "Sat 18:00" });
    assert.equal(pushes.length, 1); // everything else still arrives
    assert.equal(todayKey().length, 10);
  });

  it("a repeated notice (same key) is not pushed twice", async () => {
    await customer("9802000006", "Once Only");
    await device("9802000006");
    const { notify } = await import("../src/lib/customer-effects");
    const n = { userId: "9802000006", type: "booking", title: "Booking confirmed", message: "Sat 18:00", dedupeKey: "booked-x1" };
    await notify(prisma, n);
    await notify(prisma, n);
    assert.equal(pushes.length, 1);
  });
});

describe("Collect payment (Fonepay) confirms a waiting booking", () => {
  it("the customer is told the booking is confirmed, once, when staff collect it", async () => {
    const owner = await staff("owner");
    await customer("9802000007", "Fonepay Fan");
    await device("9802000007");
    const b = await booking("9802000007", "pending");
    const r = await api.post("/bookings/collect-dues", owner.auth, { anchorId: b.id, bookingIds: [b.id], goodsDueIds: [], method: "fonepay" });
    assert.equal(r.status, 200);
    assert.equal(pushes.filter((p) => p.title === "Booking confirmed").length, 1);
    assert.equal(await prisma.notification.count({ where: { userId: "9802000007", title: "Booking confirmed" } }), 1);
  });
});
