import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { addDaysKey, api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const A = "9870000001"; // booked for another team
const B = "9870000002"; // captain of that team
let n = 0;

async function pending(over: Record<string, unknown> = {}, bookingOver: Record<string, unknown> = {}) {
  await prisma.user.upsert({ where: { phoneNumber: A }, update: {}, create: { phoneNumber: A, name: "Referrer A", password: "x", role: "user", isVerified: true } });
  await prisma.user.upsert({ where: { phoneNumber: B }, update: {}, create: { phoneNumber: B, name: "Captain B", password: "x", role: "user", isVerified: true } });
  const b = await prisma.booking.create({ data: { userId: A, date: addDaysKey(todayKey(), 1), startTime: "18:00", endTime: "19:00", duration: 1, customerName: "x", basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "confirmed", code: `UF-AD${++n}`, ...bookingOver } });
  return prisma.referral.create({ data: { code: `RF-T${n}`, referrerId: A, friendId: B, teamName: "Thunder FC", bookingId: b.id, bookingCode: b.code, gameDate: b.date, gameTime: b.startTime, referrerPoints: 10, friendPoints: 10, ...over } });
}
const pointsOf = async (u: string) => (await prisma.loyaltyEntry.findMany({ where: { userId: u } })).reduce((a, e) => a + Number(e.points), 0);

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

describe("Refer & Earn (admin)", () => {
  it("lists referrals with both people, filters by status, searches, and counts", async () => {
    const mgr = await staff("admin");
    const r = await pending();
    await customer("9870000009", "Someone Else").catch(() => {});
    const all = (await api.get("/refer", mgr.auth)).body.data;
    assert.equal(all.total, 1);
    assert.equal(all.items[0].referrerName, "Referrer A");
    assert.equal(all.items[0].friendName, "Captain B");
    assert.equal(all.items[0].booking.status, "confirmed");
    assert.equal((await api.get("/refer?status=approved", mgr.auth)).body.data.total, 0);
    assert.equal((await api.get("/refer?q=thunder", mgr.auth)).body.data.total, 1);
    assert.equal((await api.get("/refer?q=captain", mgr.auth)).body.data.total, 1, "by name");
    assert.equal((await api.get(`/refer?q=${r.code}`, mgr.auth)).body.data.total, 1);
    const c = (await api.get("/refer/counts", mgr.auth)).body.data;
    assert.deepEqual([c.all, c.pending], [1, 1]);
    assert.equal((await api.get("/refer/overview", mgr.auth)).body.data.pending, 1);
  });

  it("approving gives BOTH customers the points once, with notices, and cannot be repeated", async () => {
    const mgr = await staff("admin");
    const r = await pending();
    const ok = await api.post(`/refer/${r.id}/approve`, mgr.auth, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, "approved");
    assert.equal(await pointsOf(A), 10);
    assert.equal(await pointsOf(B), 10);
    const e = await prisma.loyaltyEntry.findFirst({ where: { userId: A } });
    assert.equal(e!.kind, "referral");
    assert.ok(e!.expiresOn && e!.expiresOn > todayKey(), "expires after about 12 months");
    assert.ok((await prisma.notification.count({ where: { userId: B } })) >= 1);
    assert.equal((await api.post(`/refer/${r.id}/approve`, mgr.auth, {})).status, 409);
    assert.equal(await pointsOf(A), 10, "no double award");
    assert.equal((await api.post(`/refer/${r.id}/reject`, mgr.auth, { reason: "too late" })).status, 409);
  });

  it("staff can change the points before approving, either side", async () => {
    const mgr = await staff("admin");
    const r = await pending();
    assert.equal((await api.patch(`/refer/${r.id}`, mgr.auth, { referrerPoints: 20 })).body.data.referrerPoints, 20);
    assert.equal((await api.post(`/refer/${r.id}/approve`, mgr.auth, { friendPoints: 7.5 })).status, 200);
    assert.equal(await pointsOf(A), 20);
    assert.equal(await pointsOf(B), 7.5);
    assert.equal((await api.patch(`/refer/${r.id}`, mgr.auth, { referrerPoints: 1 })).status, 409, "no longer pending");
    const bad = await pending();
    assert.equal((await api.patch(`/refer/${bad.id}`, mgr.auth, { referrerPoints: 500 })).status, 400);
    assert.equal((await api.patch(`/refer/${bad.id}`, mgr.auth, { friendPoints: -1 })).status, 400);
  });

  it("refuses to approve when the booking was cancelled; rejecting needs a reason and tells the customer", async () => {
    const mgr = await staff("admin");
    const gone = await pending({}, { status: "cancelled" });
    assert.equal((await api.post(`/refer/${gone.id}/approve`, mgr.auth, {})).status, 409);
    assert.equal(await pointsOf(A), 0);
    assert.equal((await api.post(`/refer/${gone.id}/reject`, mgr.auth, {})).status, 400);
    const rej = await api.post(`/refer/${gone.id}/reject`, mgr.auth, { reason: "Booking was cancelled" });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.data.staffNote, "Booking was cancelled");
    const note = await prisma.notification.findFirst({ where: { userId: A, type: "referral" } });
    assert.ok(note && /cancelled/.test(note.message));
    assert.equal(await pointsOf(A) + (await pointsOf(B)), 0);
  });

  it("adjusting an approved referral adds or removes the difference for each person", async () => {
    const mgr = await staff("admin");
    const r = await pending();
    assert.equal((await api.post(`/refer/${r.id}/adjust`, mgr.auth, { referrerPoints: 12, friendPoints: 5, reason: "Not adjusted yet" })).status, 409, "not approved yet");
    await api.post(`/refer/${r.id}/approve`, mgr.auth, {});
    const adj = await api.post(`/refer/${r.id}/adjust`, mgr.auth, { referrerPoints: 15, friendPoints: 4, reason: "Friend left early" });
    assert.equal(adj.status, 200);
    assert.equal(await pointsOf(A), 15);
    assert.equal(await pointsOf(B), 4);
    assert.equal(adj.body.data.referrerPoints, 15);
    assert.equal((await api.post(`/refer/${r.id}/adjust`, mgr.auth, { referrerPoints: 15, friendPoints: 4, reason: "No change at all" })).status, 409);
    assert.equal((await api.post(`/refer/${r.id}/adjust`, mgr.auth, { referrerPoints: 15, friendPoints: 4, reason: "x" })).status, 400);
    await api.post(`/refer/${r.id}/adjust`, mgr.auth, { referrerPoints: 15, friendPoints: 4.5, reason: "Small top up again" });
    assert.equal(await pointsOf(B), 4.5);
  });

  it("settings: points, pause, and the customer app reads the same row", async () => {
    const mgr = await staff("admin");
    assert.deepEqual((await api.get("/refer/settings", mgr.auth)).body.data, { enabled: true, referrerPoints: 10, friendPoints: 10 });
    assert.equal((await api.put("/refer/settings", mgr.auth, { enabled: false, referrerPoints: 12.34, friendPoints: 3 })).status, 200);
    const stored = JSON.parse((await prisma.settings.findUnique({ where: { key: "referEarn" } }))!.value);
    assert.deepEqual(stored, { enabled: false, referrerPoints: 12.3, friendPoints: 3 });
    assert.equal((await api.put("/refer/settings", mgr.auth, { enabled: true, referrerPoints: 999, friendPoints: 3 })).status, 400);
    assert.equal((await api.put("/refer/settings", mgr.auth, { enabled: "yes", referrerPoints: 1, friendPoints: 1 })).status, 400);
  });

  it("small permissions: view, review, adjust and settings are separate, and every decision is audited", async () => {
    const owner = await staff("owner");
    const cat = (await api.get("/staff/catalog", owner.auth)).body.data;
    for (const k of ["refer.view", "refer.review", "refer.adjust", "refer.settings"]) assert.ok(cat.assignable.includes(k), k);
    const r = await pending();
    const v = await staffWith(["refer.view"], "v@test.np");
    assert.equal((await api.get("/refer", v.auth)).status, 200);
    assert.equal((await api.post(`/refer/${r.id}/approve`, v.auth, {})).status, 403);
    assert.equal((await api.put("/refer/settings", v.auth, { enabled: true, referrerPoints: 1, friendPoints: 1 })).status, 403);
    assert.equal((await api.get("/refer", (await staffWith([], "n@test.np")).auth)).status, 403);
    const rv = await staffWith(["refer.review"], "r@test.np");
    assert.equal((await api.post(`/refer/${r.id}/approve`, rv.auth, {})).status, 200);
    assert.equal((await api.post(`/refer/${r.id}/adjust`, rv.auth, { referrerPoints: 1, friendPoints: 1, reason: "Review only" })).status, 403);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "referral", action: "approve" } })) >= 1);
  });
});
