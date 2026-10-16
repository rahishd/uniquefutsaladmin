import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { addDaysKey, api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const BUYER = "9800000941";
const FRIEND = "9800000942";
let n = 0;

// what the customer backend writes when a gift is paid
async function paidPointsGift(points = 50) {
  const code = `GIFT-TEST${++n}`;
  const g = await prisma.gift.create({ data: { code, kind: "points", buyerId: BUYER, friendId: FRIEND, points, amount: points * 10, status: "paid", paidAt: new Date(), message: "Enjoy" } });
  await prisma.paymentOrder.create({ data: { orderCode: code, purpose: "gift_points", userId: BUYER, method: "fonepay", amount: points * 10, status: "paid", paidAt: new Date(), remarks: `Gift Card points - ${code}`, expiresAt: new Date() } });
  await prisma.loyaltyEntry.create({ data: { userId: FRIEND, kind: "gift", points: new Prisma.Decimal(points), earnedOn: todayKey(), expiresOn: addDaysKey(todayKey(), 365), sourceType: "gift", sourceId: g.id, detail: "Gift from Asha" } });
  return g;
}
async function paidGameGift() {
  const date = addDaysKey(todayKey(), 2);
  const b = await prisma.booking.create({
    data: { userId: FRIEND, date, startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "full", status: "confirmed", paymentStatus: "completed", code: `UF-GF${++n}`, notes: `GIFT_FROM:${BUYER}` },
  });
  await prisma.bookingSlot.create({ data: { date, hour: 18, bookingId: b.id } });
  await prisma.booking.update({ where: { id: b.id }, data: { paymentOrderCode: b.id } });
  await prisma.paymentOrder.create({ data: { orderCode: b.id, purpose: "game", userId: BUYER, method: "fonepay", amount: 1500, status: "paid", paidAt: new Date(), remarks: `Regular game - ${b.id}`, expiresAt: new Date() } });
  const g = await prisma.gift.create({ data: { code: `GIFT-GAME${n}`, kind: "game", buyerId: BUYER, friendId: FRIEND, bookingId: b.id, amount: 1500, status: "paid", paidAt: new Date() } });
  return { g, b };
}
async function limited(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

describe("Gift Card (admin)", () => {
  it("lists every gift with buyer, friend, payment and delivery, and totals the paid ones", async () => {
    const mgr = await staff("admin");
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    await paidPointsGift(50);
    await paidGameGift();
    await prisma.gift.create({ data: { code: "GIFT-WAIT1", kind: "points", buyerId: BUYER, friendId: FRIEND, points: 10, amount: 100 } });

    const r = await api.get("/gifts", mgr.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.total, 3);
    assert.deepEqual(
      [r.body.data.summary.paid, r.body.data.summary.pending, r.body.data.summary.revenue, r.body.data.summary.pointsSold, r.body.data.summary.gameGifts],
      [2, 1, 2000, 50, 1],
    );
    const pts = r.body.data.items.find((i: { kind: string; status: string }) => i.kind === "points" && i.status === "paid");
    assert.equal(pts.buyer.name, "Asha Buyer");
    assert.equal(pts.friend.phone, FRIEND);
    assert.equal(pts.pointsDelivered, true);
    assert.equal(pts.payment.status, "paid");
    const game = r.body.data.items.find((i: { kind: string }) => i.kind === "game");
    assert.equal(game.game.startTime, "18:00");

    // filters and search
    assert.equal((await api.get("/gifts?kind=game", mgr.auth)).body.data.total, 1);
    assert.equal((await api.get("/gifts?status=pending", mgr.auth)).body.data.total, 1);
    assert.equal((await api.get("/gifts?q=bikash", mgr.auth)).body.data.total, 3);
    assert.equal((await api.get("/gifts?q=GIFT-WAIT", mgr.auth)).body.data.total, 1);
  });

  it("cancelling a gifted game frees the hour, puts the refund on the list and tells both", async () => {
    const mgr = await staff("admin");
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    const { g, b } = await paidGameGift();
    assert.equal((await api.post(`/gifts/${g.id}/cancel`, mgr.auth, { reason: "x" })).status, 400, "a reason is needed");
    const r = await api.post(`/gifts/${g.id}/cancel`, mgr.auth, { reason: "Buyer asked" });
    assert.equal(r.status, 200);
    assert.equal((await prisma.booking.findUnique({ where: { id: b.id } }))!.status, "cancelled");
    assert.equal(await prisma.bookingSlot.count({ where: { bookingId: b.id } }), 0);
    assert.equal((await prisma.paymentOrder.findUnique({ where: { orderCode: b.id } }))!.status, "refunded");
    assert.equal((await prisma.gift.findUnique({ where: { id: g.id } }))!.status, "refunded");
    const refunds = await api.get("/payments/refunds?status=due", mgr.auth);
    assert.ok(refunds.body.data.some((o: { orderCode: string }) => o.orderCode === b.id));
    assert.equal(await prisma.notification.count({ where: { userId: FRIEND, title: "Gifted game cancelled" } }), 1);
    assert.equal(await prisma.notification.count({ where: { userId: BUYER, title: "Gift cancelled" } }), 1);
    assert.equal((await api.post(`/gifts/${g.id}/cancel`, mgr.auth, { reason: "again" })).status, 409);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "gift" } })) >= 1);
  });

  it("cancelling a points gift takes the points back, but not once the friend has spent them", async () => {
    const mgr = await staff("admin");
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    const g = await paidPointsGift(50);
    const r = await api.post(`/gifts/${g.id}/cancel`, mgr.auth, { reason: "Paid by mistake" });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.pointsTakenBack, true);
    const sum = (await prisma.loyaltyEntry.findMany({ where: { userId: FRIEND } })).reduce((s, e) => s + Number(e.points), 0);
    assert.equal(sum, 0);
    assert.equal((await prisma.paymentOrder.findUnique({ where: { orderCode: g.code } }))!.status, "refunded");

    const spent = await paidPointsGift(125);
    await prisma.loyaltyEntry.create({ data: { userId: FRIEND, kind: "free_game", points: new Prisma.Decimal(-125), earnedOn: todayKey(), sourceType: "voucher", sourceId: "v1", detail: "Free game" } });
    const no = await api.post(`/gifts/${spent.id}/cancel`, mgr.auth, { reason: "Paid by mistake" });
    assert.equal(no.status, 409);
    assert.equal((await prisma.gift.findUnique({ where: { id: spent.id } }))!.status, "paid");
  });

  it("a gifted game cancelled from Bookings marks the gift and tells the buyer", async () => {
    const mgr = await staff("admin");
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    const { g, b } = await paidGameGift();
    assert.equal((await api.post(`/bookings/${b.id}/cancel`, mgr.auth, { reason: "Rain" })).status, 200);
    assert.equal((await prisma.gift.findUnique({ where: { id: g.id } }))!.status, "refunded");
    assert.equal(await prisma.notification.count({ where: { userId: BUYER, title: "Gift cancelled" } }), 1);
  });

  it("shows points gifts on the Payments Gift Card tab and in the takings", async () => {
    const mgr = await staff("admin");
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    await paidPointsGift(30);
    const led = await api.get("/payments/ledger?kind=gift", mgr.auth);
    assert.equal(led.status, 200);
    assert.deepEqual(led.body.data.items.map((i: { kind: string; amount: number; status: string }) => [i.kind, i.amount, i.status]), [["gift", 300, "paid"]]);
    const funds = await api.get("/service-funds", mgr.auth);
    assert.equal(funds.body.data.base.giftCards, 300);
  });

  it("needs the Gift Card permissions", async () => {
    await customer(BUYER, "Asha Buyer");
    await customer(FRIEND, "Bikash Friend");
    const g = await paidPointsGift(10);
    const viewer = await limited(["giftcards.view"], "gv@test.np");
    assert.equal((await api.get("/gifts", viewer.auth)).status, 200);
    assert.equal((await api.post(`/gifts/${g.id}/cancel`, viewer.auth, { reason: "Not allowed" })).status, 403);
    const none = await limited([], "gn@test.np");
    assert.equal((await api.get("/gifts", none.auth)).status, 403);
  });
});
