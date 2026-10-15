import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const MEMBER = "9800000861";
const OTHER = "9800000862";
const day = () => addDaysKey(todayKey(), 3);

async function club(phone: string, days = 30) {
  await prisma.clubMember.create({ data: { userId: phone, validUntil: new Date(Date.now() + days * 86400000) } });
}

describe("Unique Club in the admin portal", () => {
  it("gives a club member 10% off a walk-in booking and records it", async () => {
    const mgr = await staff("admin");
    await customer(MEMBER, "Club Member");
    await customer(OTHER, "Plain Player");
    await club(MEMBER);

    const a = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "18:00", customerName: "Club Member", customerPhone: MEMBER });
    assert.equal(a.status, 201);
    const b = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "19:00", customerName: "Plain Player", customerPhone: OTHER });
    assert.equal(b.status, 201);

    const m = a.body.data, p = b.body.data;
    assert.ok(m.clubDiscount > 0, "the member got a club discount");
    assert.equal(m.clubDiscount, Math.round(m.basePrice * 0.1));
    assert.equal(m.totalPrice, m.basePrice - m.clubDiscount);
    assert.equal(m.discountAmount, m.clubDiscount);
    assert.match(m.notes, /UNIQUE_CLUB/);
    assert.equal(p.clubDiscount, 0);
    assert.equal(p.totalPrice, p.basePrice);
  });

  it("does not discount an expired club, or a price the staff typed in", async () => {
    const mgr = await staff("admin");
    await customer(MEMBER, "Club Member");
    await club(MEMBER, -1);
    const expired = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "18:00", customerName: "Club Member", customerPhone: MEMBER });
    assert.equal(expired.body.data.clubDiscount, 0);

    await prisma.clubMember.update({ where: { userId: MEMBER }, data: { validUntil: new Date(Date.now() + 86400000) } });
    const typed = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "19:00", customerName: "Club Member", customerPhone: MEMBER, priceOverride: 1000 });
    assert.equal(typed.body.data.clubDiscount, 0);
    assert.equal(typed.body.data.totalPrice, 1000);
  });

  it("shows the club discount on the final bill", async () => {
    const mgr = await staff("admin");
    await customer(MEMBER, "Club Member");
    await club(MEMBER);
    const made = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "18:00", customerName: "Club Member", customerPhone: MEMBER });
    const id = made.body.data.id;
    const paid = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: id, bookingIds: [id], method: "venue" });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.clubDiscount, made.body.data.clubDiscount);
    assert.equal(paid.body.data.lines[0].clubDiscount, made.body.data.clubDiscount);
    assert.equal(paid.body.data.total, made.body.data.totalPrice);
  });

  it("lists the club discount on payments, and the Rs. 1,500 club payments", async () => {
    const mgr = await staff("admin");
    await customer(MEMBER, "Club Member");
    await club(MEMBER);
    await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "18:00", customerName: "Club Member", customerPhone: MEMBER });
    const court = await api.get("/payments/ledger?kind=court", mgr.auth);
    assert.equal(court.status, 200);
    assert.ok(court.body.data.items[0].clubDiscount > 0);

    await prisma.paymentOrder.create({ data: { orderCode: "CLUB-TEST0001", purpose: "club", userId: MEMBER, method: "fonepay", amount: 1500, remarks: "Unique Club - CLUB-TEST0001", status: "paid", paidAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
    const clubs = await api.get("/payments/ledger?kind=club", mgr.auth);
    assert.equal(clubs.status, 200);
    assert.equal(clubs.body.data.items.length, 1);
    assert.deepEqual([clubs.body.data.items[0].amount, clubs.body.data.items[0].status, clubs.body.data.items[0].customer], [1500, "paid", "Club Member"]);
    const sum = await api.get("/payments/summary?kind=club", mgr.auth);
    assert.equal(sum.body.data.paid.sum, 1500);
  });
});

describe("Unique Club and hosted tournaments", () => {
  it("takes 10% off the court charge when the host is a club member", async () => {
    const mgr = await staff("admin");
    await customer("9841000000", "Anil Gurung");
    const d1 = addDaysKey(todayKey(), 1);
    const plain = await api.post("/tournaments", mgr.auth, { name: "Plain Cup", hostName: "Anil Gurung", hostPhone: "9841000000", minRate: 2000, days: [{ date: d1, startHour: 5, endHour: 8 }] });
    assert.equal(plain.status, 201);
    assert.equal(plain.body.data.clubDiscount, 0);
    assert.equal(plain.body.data.total, 6000);

    // a member who has only just joined (and played nothing) does not get it yet
    await prisma.clubMember.create({ data: { userId: "9841000000", validUntil: new Date(Date.now() + 30 * 86400000) } });
    const young = (await api.get(`/tournaments/${plain.body.data.id}/billing`, mgr.auth)).body.data;
    assert.equal(young.clubDiscount, 0);
    assert.equal(young.total, 6000);

    // 15 days in: unlocked
    await prisma.clubMember.update({ where: { userId: "9841000000" }, data: { startedAt: new Date(Date.now() - 16 * 86400000) } });
    const b = (await api.get(`/tournaments/${plain.body.data.id}/billing`, mgr.auth)).body.data;
    assert.equal(b.court, 6000);
    assert.equal(b.club, true);
    assert.equal(b.clubDiscount, 600);
    assert.equal(b.total, 5400);
  });
});

describe("Unique Club members page", () => {
  it("lists members with status, dates, payments, discount given and the totals", async () => {
    const mgr = await staff("admin");
    await customer(MEMBER, "Club Member");
    await customer(OTHER, "Lapsed Player");
    await prisma.clubMember.create({ data: { userId: MEMBER, startedAt: new Date(Date.now() - 20 * 86400000), validUntil: new Date(Date.now() + 10 * 86400000), payments: 2 } });
    await prisma.clubMember.create({ data: { userId: OTHER, startedAt: new Date(Date.now() - 60 * 86400000), validUntil: new Date(Date.now() - 5 * 86400000) } });
    await prisma.paymentOrder.create({ data: { orderCode: "CLUB-LIST0001", purpose: "club", userId: MEMBER, method: "fonepay", amount: 1500, remarks: "Unique Club", status: "paid", paidAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
    // one discounted game
    const made = await api.post("/bookings/walk-in", mgr.auth, { date: day(), startTime: "18:00", customerName: "Club Member", customerPhone: MEMBER });
    assert.equal(made.status, 201);

    const r = await api.get("/club", mgr.auth);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.summary.active, r.body.data.summary.expired, r.body.data.summary.revenue], [1, 1, 1500]);
    const m = r.body.data.items.find((x: { phone: string }) => x.phone === MEMBER);
    assert.equal(m.status, "active");
    assert.equal(m.name, "Club Member");
    assert.equal(m.mature, true, "20 days in");
    assert.ok(m.discountGiven > 0 && m.discountedGames === 1);
    assert.equal(r.body.data.items.find((x: { phone: string }) => x.phone === OTHER).status, "expired");

    const only = await api.get("/club?status=expired", mgr.auth);
    assert.deepEqual(only.body.data.items.map((x: { phone: string }) => x.phone), [OTHER]);
    const search = await api.get("/club?q=Club%20Member", mgr.auth);
    assert.deepEqual(search.body.data.items.map((x: { phone: string }) => x.phone), [MEMBER]);
  });

  it("needs the club permission", async () => {
    const bad = await api.get("/club", { Authorization: "Bearer nope" });
    assert.equal(bad.status, 401);
  });
});
