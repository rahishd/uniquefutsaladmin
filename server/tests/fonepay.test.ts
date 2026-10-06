import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, customer, paidQr, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const P = "9870005555";
const today = todayKey();
const game = (code: string, total: number) =>
  prisma.booking.create({ data: { userId: P, date: today, startTime: "10:00", endTime: "11:00", duration: 1, customerName: "Qr Payer", customerPhone: P, basePrice: total, subtotal: total, totalPrice: total, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code } });
async function limited(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

describe("Fonepay dynamic QR", () => {
  it("makes a QR for an exact amount, with its own reference, an image and a time limit", async () => {
    const mgr = await staff("admin");
    const r = await api.post("/fonepay/qr", mgr.auth, { amount: 500, purpose: "counter" });
    assert.equal(r.status, 201);
    const q = r.body.data;
    assert.deepEqual([q.amount, q.status, q.mode, q.used], [500, "pending", "test", false]);
    assert.match(q.prn, /^UFQ[0-9A-Z]{10}$/);
    assert.ok(q.qrPayload.includes(q.prn) && q.qrPayload.includes("AMT=500"));
    assert.match(q.qrImage, /^data:image\/png;base64,/);
    const mins = (new Date(q.expiresAt).getTime() - Date.now()) / 60000;
    assert.ok(mins > 9 && mins <= 10, "valid for 10 minutes");
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 12.5 }, { amount: 2_000_000 }, {}]) assert.equal((await api.post("/fonepay/qr", mgr.auth, bad)).status, 400, JSON.stringify(bad));
  });

  it("is paid only when the gateway says so; the status can be polled; repeating changes nothing", async () => {
    const mgr = await staff("admin");
    const q = (await api.post("/fonepay/qr", mgr.auth, { amount: 500 })).body.data;
    assert.equal((await api.get(`/fonepay/qr/${q.id}`, mgr.auth)).body.data.status, "pending");
    const paid = await api.post(`/fonepay/qr/${q.id}/simulate-paid`, mgr.auth);
    assert.equal(paid.body.data.status, "paid");
    assert.match(paid.body.data.reference, /^TEST-/);
    const again = await api.post(`/fonepay/qr/${q.id}/simulate-paid`, mgr.auth);
    assert.equal(again.status, 200);
    assert.equal((await prisma.fonepayQr.findUnique({ where: { id: q.id } }))!.paidReference, paid.body.data.reference, "the first payment record stays");
    assert.equal((await api.get(`/fonepay/qr/${q.id}`, mgr.auth)).body.data.status, "paid");
    assert.equal((await api.get("/fonepay/qr/nope", mgr.auth)).status, 404);
  });

  it("an expired or cancelled QR cannot be paid", async () => {
    const mgr = await staff("admin");
    const old = (await api.post("/fonepay/qr", mgr.auth, { amount: 300 })).body.data;
    await prisma.fonepayQr.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api.get(`/fonepay/qr/${old.id}`, mgr.auth)).body.data.status, "expired");
    assert.equal((await api.post(`/fonepay/qr/${old.id}/simulate-paid`, mgr.auth)).status, 409);
    const c = (await api.post("/fonepay/qr", mgr.auth, { amount: 300 })).body.data;
    assert.equal((await api.post(`/fonepay/qr/${c.id}/cancel`, mgr.auth)).body.data.status, "failed");
    assert.equal((await api.post(`/fonepay/qr/${c.id}/simulate-paid`, mgr.auth)).status, 409);
    const p = await paidQr(mgr.auth, 300);
    assert.equal((await api.post(`/fonepay/qr/${p}/cancel`, mgr.auth)).status, 409, "a paid QR cannot be cancelled");
  });

  it("the gateway callback is public but refused until the real provider is set up", async () => {
    const r = await request(app).post("/api/admin/fonepay/webhook").send({ prn: "X", amount: 1 });
    assert.equal(r.status, 501);
    assert.match(r.body.message, /not configured/i);
    assert.equal((await request(app).post("/api/admin/fonepay/qr").send({ amount: 5 })).status, 401, "making a QR needs a staff sign-in");
  });

  it("only staff who collect money can make or check QRs", async () => {
    const none = await limited(["bookings.view"], "n@test.np");
    assert.equal((await api.post("/fonepay/qr", none.auth, { amount: 100 })).status, 403);
    const sell = await limited(["inventory.sell"], "s@test.np");
    assert.equal((await api.post("/fonepay/qr", sell.auth, { amount: 100 })).status, 201);
  });
});

describe("Cash + Fonepay: Rs. 500 cash, the rest by dynamic QR", () => {
  it("a Rs. 1000 due: 500 cash and a 500 QR settle it, and the QR can be used only once", async () => {
    const mgr = await staff("admin");
    await customer(P, "Qr Payer");
    const g = await game("UF-QR0001", 1000);
    const body = { anchorId: g.id, bookingIds: [g.id], payments: [{ method: "cash", amount: 500 }, { method: "fonepay", amount: 500 }] };
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, body)).status, 400, "no QR at all");
    const q = (await api.post("/fonepay/qr", mgr.auth, { amount: 500, customerPhone: P })).body.data;
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { ...body, fonepayQrId: q.id })).status, 409, "QR not paid yet");
    assert.equal((await prisma.booking.findUnique({ where: { id: g.id } }))!.paymentStatus, "pending");
    const wrong = await paidQr(mgr.auth, 400);
    const bad = await api.post("/bookings/collect-dues", mgr.auth, { ...body, fonepayQrId: wrong });
    assert.equal(bad.status, 409);
    assert.match(bad.body.message, /QR is for Rs. 400 but the Fonepay part is Rs. 500/);
    await api.post(`/fonepay/qr/${q.id}/simulate-paid`, mgr.auth);
    const ok = await api.post("/bookings/collect-dues", mgr.auth, { ...body, fonepayQrId: q.id });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.total, 1000);
    const b = await prisma.booking.findUnique({ where: { id: g.id } });
    assert.deepEqual([b!.cashAmount, b!.onlineAmount, b!.paymentStatus], [500, 500, "completed"]);
    const used = await prisma.fonepayQr.findUnique({ where: { id: q.id } });
    assert.ok(used!.consumedAt);
    assert.equal(used!.consumedFor, ok.body.data.billCode, "the QR is tied to the bill");
    const g2 = await game("UF-QR0002", 1000);
    const reuse = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g2.id, bookingIds: [g2.id], payments: body.payments, fonepayQrId: q.id });
    assert.equal(reuse.status, 409);
    assert.match(reuse.body.message, /already used/);
    assert.equal((await prisma.booking.findUnique({ where: { id: g2.id } }))!.paymentStatus, "pending");
  });

  it("all-cash needs no QR, and an all-Fonepay bill needs a QR for the whole amount", async () => {
    const mgr = await staff("admin");
    await customer(P, "Qr Payer");
    const g = await game("UF-QR0003", 800);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], method: "fonepay" })).status, 400);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], method: "fonepay", fonepayQrId: await paidQr(mgr.auth, 800) })).status, 200);
    const g2 = await game("UF-QR0004", 600);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g2.id, bookingIds: [g2.id], method: "venue" })).status, 200);
  });

  it("eSewa is gone: it is refused everywhere money is taken", async () => {
    const mgr = await staff("admin");
    await customer(P, "Qr Payer");
    const g = await game("UF-QR0005", 500);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], method: "esewa" })).status, 400);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], payments: [{ method: "esewa", amount: 500 }] })).status, 400);
    assert.equal((await api.post(`/bookings/${g.id}/mark-paid`, mgr.auth, { method: "esewa" })).status, 400);
    assert.equal((await api.post("/bookings/walk-in", mgr.auth, { date: today, startTime: "20:00", customerName: "Walk In", paymentMethod: "esewa" })).status, 400);
  });
});
