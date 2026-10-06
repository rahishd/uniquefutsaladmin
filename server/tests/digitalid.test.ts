import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, customer, prisma, reset, staff } from "./helpers";
import { todayKey } from "../src/lib/dates";

const P = "9800002201";
const TOKEN = "A".repeat(32);
let owner: Awaited<ReturnType<typeof staff>>;
let plain: Awaited<ReturnType<typeof staff>>; // staff with no permissions
let scanner: Awaited<ReturnType<typeof staff>>; // may scan, may not mark attendance

before(async () => {
  await reset();
  await customer(P, "Digital Player");
  await prisma.digitalId.create({ data: { userId: P, token: TOKEN } });
  owner = await staff("owner");
  const mk = async (email: string, permissions: string[]) => {
    const s = await staff("staff", email);
    await prisma.staffUser.update({ where: { id: s.id }, data: { permissions } });
    return s;
  };
  plain = await mk("none@test.np", []);
  scanner = await mk("scan@test.np", ["digitalid.scan"]);
});
after(async () => { await reset(); await prisma.$disconnect(); });

describe("Digital ID: scan and search", () => {
  it("staff only, and only with the scan permission", async () => {
    const noToken = await api.post("/digital-id/resolve", {}, { code: "UFID1." + TOKEN });
    assert.equal(noToken.status, 401);
    assert.equal((await api.post("/digital-id/resolve", plain.auth, { code: "UFID1." + TOKEN })).status, 403);
    assert.equal((await api.get(`/digital-id/${P}`, plain.auth)).status, 403);
    assert.equal((await api.get("/digital-id/search?q=Digital", plain.auth)).status, 403);
  });

  it("turns a valid QR into the customer", async () => {
    const r = await api.post("/digital-id/resolve", scanner.auth, { code: "UFID1." + TOKEN });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.phone, P);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "digitalid-scan", entityId: P } }), 1);
  });

  it("refuses codes from outside Unique Futsal and unknown or replaced ones", async () => {
    const other = await api.post("/digital-id/resolve", scanner.auth, { code: "https://example.com/pay?id=1" });
    assert.equal(other.status, 422);
    assert.match(other.body.message, /not a Unique Futsal ID/);
    assert.equal((await api.post("/digital-id/resolve", scanner.auth, { code: "UFID1.short" })).status, 422);
    const unknown = await api.post("/digital-id/resolve", scanner.auth, { code: "UFID1." + "B".repeat(32) });
    assert.equal(unknown.status, 404);
  });

  it("searches by name or number as the fallback", async () => {
    const byName = await api.get("/digital-id/search?q=digital", scanner.auth);
    assert.equal(byName.body.data[0].phoneNumber, P);
    const byPhone = await api.get(`/digital-id/search?q=${P.slice(-6)}`, scanner.auth);
    assert.equal(byPhone.body.data.length, 1);
    assert.deepEqual((await api.get("/digital-id/search?q=a", scanner.auth)).body.data, []);
  });

  it("shows the full profile with the extras", async () => {
    const today = todayKey();
    await prisma.booking.create({ data: { userId: P, date: today, startTime: "23:00", endTime: "00:00", duration: 1, basePrice: 1000, subtotal: 1000, totalPrice: 1100, addOnsPrice: 100, addOns: "Water x2", waterBottles: 2, paymentMethod: "venue", paymentStatus: "completed", status: "confirmed", code: "UF-DIGI01" } });
    const r = await api.get(`/digital-id/${P}`, scanner.auth);
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.equal(d.profile.user.phoneNumber, P);
    assert.equal(d.profile.user.password, undefined, "never the password");
    assert.equal(d.extras.upcomingBookings[0].code, "UF-DIGI01");
    assert.equal(d.extras.addOns.total, 100);
    assert.equal(d.extras.addOns.bottles, 2);
    assert.equal(d.extras.spent.total, 1100);
    assert.equal(d.extras.membership, null);
    assert.equal((await api.get("/digital-id/9899999999", scanner.auth)).status, 404);
  });

  it("makes the card for a customer who never opened theirs (just registered)", async () => {
    await customer("9800002202", "New Customer");
    const r = await api.get("/digital-id/9800002202/card", scanner.auth);
    assert.equal(r.status, 200);
    assert.match(r.body.data.payload, /^UFID1\.[A-Za-z0-9_-]{32}$/);
    const again = await api.get("/digital-id/9800002202/card", scanner.auth);
    assert.equal(again.body.data.payload, r.body.data.payload);
    const back = await api.post("/digital-id/resolve", scanner.auth, { code: r.body.data.payload });
    assert.equal(back.body.data.phone, "9800002202");
  });
});

describe("Digital ID: membership attendance", () => {
  it("needs the attendance permission and an active membership, and counts once a day", async () => {
    assert.equal((await api.post(`/digital-id/${P}/attendance`, scanner.auth)).status, 403);
    assert.equal((await api.post(`/digital-id/${P}/attendance`, owner.auth)).status, 409, "no membership yet");

    const plan = await prisma.membershipPlan.create({ data: { name: "Digital Plan", price: 5000, perks: "[]" } });
    const start = new Date(todayKey() + "T00:00:00Z");
    const end = new Date(start.getTime() + 20 * 86400000);
    await prisma.membershipSubscription.create({ data: { planId: plan.id, userId: P, startDate: start, endDate: end, status: "active", paymentStatus: "verified", timeSlot: "07:00-08:00", chosenDays: [], excludeDays: [] } });

    const first = await api.post(`/digital-id/${P}/attendance`, owner.auth);
    assert.equal(first.status, 201);
    const second = await api.post(`/digital-id/${P}/attendance`, owner.auth);
    assert.equal(second.body.data.alreadyMarked, true);
    assert.equal(await prisma.membershipAttendance.count({ where: { userId: P } }), 1);

    const view = await api.get(`/digital-id/${P}`, scanner.auth);
    assert.equal(view.body.data.extras.membership.plan, "Digital Plan");
    assert.equal(view.body.data.extras.membership.attendedToday, true);
    assert.equal(view.body.data.extras.membership.attendanceCount, 1);
  });
});
