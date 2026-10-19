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

describe("Digital ID: Unique Club, Goal Rush and Find Player on the scan result", () => {
  it("shows the club, the Goal Rush games and the Find Player games of the customer", async () => {
    const day = todayKey();
    await prisma.clubMember.create({ data: { userId: P, startedAt: new Date(Date.now() - 20 * 86400000), validUntil: new Date(Date.now() + 10 * 86400000), payments: 2 } });
    await prisma.goalRushGame.create({ data: { userId: P, day, status: "completed", shotsTaken: 5, goals: 3, saves: 2, points: 1 } });
    await prisma.playerRequest.create({ data: { userId: P, date: day, startHour: 23, playersNeeded: 4, status: "open", courtPrice: 1500 } });

    const r = await api.get(`/digital-id/${P}`, owner.auth);
    assert.equal(r.status, 200);
    const x = r.body.data.extras;
    assert.equal(x.club.member, true);
    assert.equal(x.club.payments, 2);
    assert.equal(x.club.mature, true, "20 days in");
    assert.ok(x.club.daysLeft >= 9 && x.club.daysLeft <= 10);
    assert.deepEqual([x.goalRush.gamesToday, x.goalRush.pointsToday, x.goalRush.pointsTotal], [1, 1, 1]);
    assert.equal(x.findPlayer.hosting.length, 1);
    assert.deepEqual([x.findPlayer.hosting[0].needed, x.findPlayer.hosting[0].joined], [4, 0]);

    // the card to send carries the club badge
    const card = await api.get(`/digital-id/${P}/card`, owner.auth);
    assert.equal(card.body.data.club.member, true);
  });

  it("says nothing about a club for a customer who never joined", async () => {
    await prisma.clubMember.deleteMany({ where: { userId: P } });
    const r = await api.get(`/digital-id/${P}`, owner.auth);
    assert.equal(r.body.data.extras.club, null);
  });

  it("adds who they are, the emergency contact, goods taken, bulk games, a wheelchair request and insurance claims", async () => {
    await prisma.user.update({ where: { phoneNumber: P }, data: { emergencyName: "Sita Rai", emergencyPhone: "9841000000", emergencyRelation: "Sister", dateOfBirth: "2000-05-05" } });
    await prisma.goodsDue.deleteMany({ where: { userId: P } });
    await prisma.goodsDue.create({ data: { userId: P, saleId: "digid-sale-1", amount: 150, items: "6 x Mineral water", lines: JSON.stringify([{ type: "goods", label: "Mineral water", quantity: 6, amount: 150 }]), createdBy: "app:" + P } });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await prisma.booking.create({ data: { userId: P, customerName: "Digital Player", customerPhone: P, date: tomorrow, startTime: "10:00", endTime: "11:00", duration: 1, basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "fonepay", status: "pending", paymentStatus: "pending", source: "app", notes: "BULK:BLK-ABC123" } as never });
    await prisma.wheelchairRequest.create({ data: { code: "WC-DIGID1", userId: P, date: tomorrow, time: "18:00", people: 2, status: "pending", note: "Ramp please" } });
    await prisma.insuranceClaim.create({ data: { code: "IC-DIGID1", userId: P, patientName: "Digital Player", patientPhone: P, witnessName: "Hari", witnessNameNe: "Hari", severity: "emergency", incidentDate: todayKey(), status: "submitted" } });

    const x = (await api.get(`/digital-id/${P}`, owner.auth)).body.data.extras;
    assert.deepEqual(x.person.emergency, { name: "Sita Rai", phone: "9841000000", relation: "Sister" });
    assert.equal(x.person.dateOfBirth, "2000-05-05");
    assert.ok(x.person.age >= 20);
    assert.equal(x.goods.dueTotal, 150);
    assert.equal(x.goods.due[0].items, "6 x Mineral water");
    assert.equal(x.goods.due[0].lines[0].quantity, 6);
    assert.equal(x.upcomingBookings.find((b: { bulk: string | null }) => b.bulk)?.bulk, "BLK-ABC123");
    assert.equal(x.wheelchair[0].code, "WC-DIGID1");
    assert.equal(x.wheelchair[0].people, 2);
    assert.equal(x.insurance[0].code, "IC-DIGID1");
    assert.equal(x.insurance[0].open, true);
    assert.equal(x.insurance[0].severity, "emergency");
  });

  it("shows no emergency contact when none was given", async () => {
    await prisma.user.update({ where: { phoneNumber: P }, data: { emergencyName: null, emergencyPhone: null, emergencyRelation: null, dateOfBirth: null } });
    const x = (await api.get(`/digital-id/${P}`, owner.auth)).body.data.extras;
    assert.equal(x.person.emergency, null);
    assert.equal(x.person.age, null);
  });

  it("lists exactly which bookings make up the unpaid total", async () => {
    await prisma.booking.deleteMany({ where: { userId: P } });
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const mk = (n: number, hour: string, extra: object = {}) => prisma.booking.create({ data: { userId: P, customerName: "Digital Player", customerPhone: P, date: day(n), startTime: hour, endTime: "23:00", duration: 1, basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "completed", paymentStatus: "pending", source: "app", ...extra } as never });
    await mk(-3, "10:00"); // played, never paid
    await mk(1, "11:00", { status: "confirmed", notes: "BULK:BLK-XYZ789" }); // upcoming bulk game, unpaid
    await mk(-2, "12:00", { paymentStatus: "completed" }); // paid: not listed
    await mk(-1, "13:00", { status: "cancelled" }); // cancelled: not listed
    const d = (await api.get(`/digital-id/${P}`, owner.auth)).body.data;
    const list = d.extras.unpaidItems as { code: string; date: string; amount: number; bulk: string | null }[];
    assert.equal(list.length, 2);
    assert.ok(list[0].date < list[1].date, "oldest first");
    assert.equal(list[1].bulk, "BLK-XYZ789");
    assert.equal(list.reduce((n, i) => n + i.amount, 0), d.extras.spent.unpaid, "the list adds up to the unpaid total");
  });
});
