import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
const phone = "9870000001";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const booking = (code: string, extra: object = {}) =>
  prisma.booking.create({ data: { userId: phone, date: addDaysKey(today, -2), startTime: "18:00", endTime: "19:00", duration: 1, customerName: "Mina", basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "completed", paymentStatus: "completed", code, ...extra } });

const promoList = (codes: string[]) => JSON.stringify(codes.map((code) => ({ code, type: "percent", value: 20, label: "20% off", appliedTo: "booking", isActive: true })));

describe("customers page", () => {
  it("the list shows games played, money paid and owed, open complaints, and filters captains from players", async () => {
    await customer(phone, "Mina Rai");
    await customer("9870000002", "Plain Player");
    const fd = await staff("frontdesk");
    await booking("UF-C1");
    await booking("UF-C2", { totalPrice: 1500, paymentMethod: "esewa" });
    await booking("UF-C3", { status: "confirmed", paymentStatus: "pending", totalPrice: 700, date: addDaysKey(today, 2) });
    await booking("UF-C4", { status: "cancelled", paymentStatus: "pending", totalPrice: 999 });
    await prisma.gzBooking.create({ data: { code: "GZ-C1", userId: phone, consoleId: "c1", gameTitle: "FIFA", date: addDaysKey(today, -1), startHour: 14, hours: 1, players: 2, total: 400, paymentMethod: "venue", paymentStatus: "paid", status: "completed" } });
    await prisma.complaint.create({ data: { code: "CP-CUST01", userId: phone, category: "staff", message: "Rude desk staff at the venue today." } });
    await prisma.complaint.create({ data: { code: "CP-CUST02", userId: phone, category: "app", message: "The app crashed twice for me.", status: "resolved" } });
    await prisma.userPrefs.create({ data: { userId: phone, mode: "captain" } });

    const list = (await api.get("/customers?q=mina", fd.auth)).body.data;
    assert.equal(list.total, 1);
    const row = list.items[0];
    assert.equal(row.mode, "captain");
    assert.deepEqual(row.stats, { gamesPlayed: 2, gamezoneSessions: 1, paidTotal: 2500, unpaidTotal: 700, openComplaints: 1, cancelStreak: 0 });
    assert.equal(JSON.stringify(list).includes("password"), false);
    assert.deepEqual((await api.get("/customers?mode=captain", fd.auth)).body.data.items.map((i: { phoneNumber: string }) => i.phoneNumber), [phone]);
    assert.deepEqual((await api.get("/customers?mode=player", fd.auth)).body.data.items.map((i: { phoneNumber: string }) => i.phoneNumber), ["9870000002"]);
  });

  it("the profile gathers games, payments, extra items, complaints, tournaments, captain and promo settings in one call", async () => {
    await customer(phone, "Mina Rai");
    const fd = await staff("frontdesk");
    await booking("UF-P1");
    await booking("UF-P2", { totalPrice: 1500, paymentMethod: "fonepay", date: addDaysKey(today, -5) });
    await booking("UF-P3", { status: "confirmed", paymentStatus: "pending", totalPrice: 800, date: addDaysKey(today, 3) });
    await booking("UF-P4", { status: "no_show", paymentStatus: "pending", totalPrice: 600, date: addDaysKey(today, -9) });
    await prisma.goodsSale.create({ data: { userId: phone, phone, amount: 350, items: "Water x5, Energy drink", soldBy: "staff" } });
    await prisma.goodsSale.create({ data: { userId: phone, phone, amount: 150, items: "Socks", soldBy: "staff" } });
    await prisma.complaint.create({ data: { code: "CP-PROF01", userId: phone, category: "facilities", message: "The left goal net is torn badly." } });
    const t = await prisma.tournament.create({ data: { name: "Dashain Cup", prizePool: 50000, minTeams: 4, maxTeams: 8, startDate: "2026-10-20", endDate: "2026-10-22" } });
    await prisma.registration.create({ data: { tournamentId: t.id, teamName: "Red Hawks", captainName: "Mina", contactEmail: "m@x.np", contactPhone: phone, players: "[]", status: "approved" } });
    await customer("9870000009", "Rival Captain");
    const mine = await prisma.team.create({ data: { name: "Red Hawks", captainId: phone } });
    const rival = await prisma.team.create({ data: { name: "Blue Eagles", captainId: "9870000009" } });
    await prisma.teamMember.create({ data: { teamId: mine.id, userId: phone } });
    await prisma.userPrefs.create({ data: { userId: phone, mode: "captain", position: "FWD", location: "Tilottama" } });
    const hosted = await prisma.challenge.create({ data: { challengerTeamId: mine.id, challengedTeamId: rival.id, type: "match", date: addDaysKey(today, -3), startHour: 18, courtPrice: 2000, loserPct: 70, status: "accepted" } });
    await prisma.challengeResult.create({ data: { challengeId: hosted.id, submittedByTeamId: mine.id, scoreSubmitter: 3, scoreOther: 1, status: "approved" } });

    const p = (await api.get(`/customers/${phone}/profile`, fd.auth)).body.data;
    assert.equal(p.user.name, "Mina Rai");
    assert.equal(p.contact.phone, phone);
    assert.deepEqual({ played: p.games.played, upcoming: p.games.upcoming, noShows: p.games.noShows }, { played: 2, upcoming: 1, noShows: 1 });
    assert.equal(p.games.lastGame, addDaysKey(today, -2));
    assert.equal(p.games.firstGame, addDaysKey(today, -5));
    assert.deepEqual(p.payments.paid, { amount: 2500, count: 2 });
    assert.deepEqual(p.payments.paidCash, { amount: 1000, count: 1 });
    assert.deepEqual(p.payments.paidOnline, { amount: 1500, count: 1 });
    assert.deepEqual(p.payments.unpaid, { amount: 1400, count: 2 });
    assert.equal(p.payments.recent[0].code, "UF-P3", "newest first");
    assert.equal(p.goods.total, 500);
    assert.equal(p.goods.count, 2);
    assert.equal(p.complaints.total, 1);
    assert.equal(p.complaints.open, 1);
    assert.equal(p.complaints.recent[0].categoryLabel, "Court or facilities");
    assert.equal(p.tournaments.entered[0].tournament, "Dashain Cup");
    assert.equal(p.tournaments.challengesHosted.count, 1);
    assert.equal(p.tournaments.challengesHosted.recent[0].opponent, "Blue Eagles");
    assert.deepEqual({ mode: p.profile.mode, isCaptain: p.profile.isCaptain, position: p.profile.position, team: p.profile.team.name, role: p.profile.team.role }, { mode: "captain", isCaptain: true, position: "FWD", team: "Red Hawks", role: "captain" });
    assert.deepEqual(p.profile.team.record, { played: 1, won: 1, drawn: 0, lost: 0 });
    assert.equal(p.vip, null);
    assert.equal(p.promos, undefined, "promo switches are not part of the customer page");
    assert.equal(p.cancellations.total, 0);
    assert.equal(JSON.stringify(p).includes("password"), false);
    assert.equal((await api.get("/customers/9000000000/profile", fd.auth)).status, 404);
  });

  it("a customer with no games, payments or team still gets a complete, empty profile", async () => {
    await customer("9870000005", "Brand New");
    const fd = await staff("frontdesk");
    const p = (await api.get("/customers/9870000005/profile", fd.auth)).body.data;
    assert.equal(p.games.played, 0);
    assert.equal(p.games.lastGame, null);
    assert.deepEqual(p.payments.paid, { amount: 0, count: 0 });
    assert.equal(p.goods.count, 0);
    assert.equal(p.complaints.total, 0);
    assert.equal(p.profile.mode, "player");
    assert.equal(p.profile.team, null);
    assert.deepEqual(p.tournaments.entered, []);
    assert.equal(p.tournaments.challengesHosted.count, 0);
  });

  it("the old per-customer promo switches are gone", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    assert.equal((await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "*", enabled: false })).status, 404);
  });
});

describe("cancellations in a row", () => {
  const mk = (code: string, n: number, extra: object = {}) =>
    prisma.booking.create({ data: { userId: phone, date: addDaysKey(today, 3), startTime: "18:00", endTime: "19:00", duration: 1, customerName: "Mina", basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "confirmed", code, createdAt: new Date(Date.now() - (100 - n) * 60000), ...extra } });
  const cancelled = (code: string, n: number, extra: object = {}) => mk(code, n, { status: "cancelled", cancelledAt: new Date(Date.now() - (100 - n) * 60000 + 30000), ...extra });
  const streakOf = async (auth: Record<string, string>) => (await api.get("/customers?q=mina", auth)).body.data.items[0].stats.cancelStreak;

  it("counts the newest bookings that were all cancelled, and stops at the first one that was not", async () => {
    await customer(phone, "Mina Rai");
    const fd = await staff("frontdesk");
    await mk("UF-K1", 1, { status: "completed", paymentStatus: "completed" });
    await cancelled("UF-K2", 2);
    await cancelled("UF-K3", 3);
    await cancelled("UF-K4", 4);
    await cancelled("UF-K5", 5);
    assert.equal(await streakOf(fd.auth), 4);
    await mk("UF-K6", 6); // a newer booking that was kept ends the run
    assert.equal(await streakOf(fd.auth), 0);
  });

  it("does not count cancellations made by staff or unpaid holds that simply expired", async () => {
    await customer(phone, "Mina Rai");
    const fd = await staff("frontdesk");
    await cancelled("UF-S1", 1);
    const byStaff = await cancelled("UF-S2", 2);
    await mk("UF-S3", 3, { status: "expired" });
    await cancelled("UF-S4", 4);
    assert.equal(await streakOf(fd.auth), 3, "all three cancels count while nothing is excluded: S4, expired skipped, S2, S1");
    await prisma.adminAuditLog.create({ data: { staffId: fd.id, staffName: "staff", action: "cancel", entity: "booking", entityId: byStaff.id } });
    assert.equal(await streakOf(fd.auth), 2, "the one staff cancelled is left out");
  });

  it("Gamezone cancellations count in the same run", async () => {
    await customer(phone, "Mina Rai");
    const fd = await staff("frontdesk");
    await cancelled("UF-G1", 1);
    await prisma.gzBooking.create({ data: { code: "GZ-K1", userId: phone, consoleId: "c1", gameTitle: "FIFA", date: addDaysKey(today, 2), startHour: 15, hours: 1, players: 2, total: 400, paymentMethod: "venue", paymentStatus: "pending", status: "cancelled" } });
    assert.equal(await streakOf(fd.auth), 2);
  });

  it("the profile keeps the record: totals, the last 30 days, how late each was, and what was already paid", async () => {
    await customer(phone, "Mina Rai");
    const fd = await staff("frontdesk");
    const start = addDaysKey(today, 2);
    const hoursAhead = (h: number) => new Date(new Date(`${start}T18:00:00+05:45`).getTime() - h * 3600000);
    await cancelled("UF-R1", 1, { date: start, cancelledAt: hoursAhead(30), paymentStatus: "completed", paymentMethod: "esewa" });
    await cancelled("UF-R2", 2, { date: start, cancelledAt: hoursAhead(1) });
    await cancelled("UF-R3", 3, { date: addDaysKey(today, -60), cancelledAt: new Date(Date.now() - 60 * 86400000), createdAt: new Date(Date.now() - 61 * 86400000) });
    const c = (await api.get(`/customers/${phone}/profile`, fd.auth)).body.data.cancellations;
    assert.equal(c.total, 3);
    assert.equal(c.last30, 2);
    assert.equal(c.lateCount, 1, "cancelled under 2 hours before the game");
    const r1 = c.recent.find((r: { code: string }) => r.code === "UF-R1");
    const r2 = c.recent.find((r: { code: string }) => r.code === "UF-R2");
    assert.equal(r1.hoursBefore, 30);
    assert.equal(r1.wasPaid, true);
    assert.equal(r2.hoursBefore, 1);
    assert.equal(c.streak, 3);
  });

  it("staff can suspend the account at once from here", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    await cancelled("UF-X1", 1);
    assert.equal((await api.post(`/customers/${phone}/suspend`, mgr.auth)).status, 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { phoneNumber: phone } })).isActive, false);
    assert.equal((await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data.user.isActive, false);
  });
});

describe("VIP discount code", () => {
  const body = { code: "adminvip", type: "percent", value: 10, note: "Owner's friend" };

  it("staff give a customer a VIP code, the profile shows it unclaimed, and how much it has saved once used", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    const made = await api.put(`/customers/${phone}/vip`, mgr.auth, body);
    assert.equal(made.status, 201);
    assert.equal(made.body.data.code, "ADMINVIP");
    let v = (await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data.vip;
    assert.deepEqual({ code: v.code, type: v.type, value: v.value, active: v.active, claimed: v.claimedAt !== null, note: v.note }, { code: "ADMINVIP", type: "percent", value: 10, active: true, claimed: false, note: "Owner's friend" });
    assert.deepEqual(v.usage, { games: 0, discountGiven: 0 });

    // the customer app marks it claimed and records the code on each booking it discounts
    await prisma.vipCode.update({ where: { userId: phone }, data: { claimedAt: new Date() } });
    await booking("UF-V1", { promoCode: "ADMINVIP", discountAmount: 100, totalPrice: 900 });
    await booking("UF-V2", { promoCode: "ADMINVIP", discountAmount: 100, totalPrice: 900 });
    await booking("UF-V3", { promoCode: "ADMINVIP", discountAmount: 100, totalPrice: 900, status: "cancelled" });
    v = (await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data.vip;
    assert.notEqual(v.claimedAt, null);
    assert.deepEqual(v.usage, { games: 2, discountGiven: 200 }, "cancelled bookings are not counted");
  });

  it("a rupee amount, pausing, changing the code and removing it", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    await api.put(`/customers/${phone}/vip`, mgr.auth, { code: "ADMINVIP", type: "flat", value: 250 });
    await prisma.vipCode.update({ where: { userId: phone }, data: { claimedAt: new Date() } });

    const paused = await api.put(`/customers/${phone}/vip`, mgr.auth, { code: "ADMINVIP", type: "flat", value: 250, active: false });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.active, false);
    assert.notEqual(paused.body.data.claimedAt, null, "pausing keeps the claim");

    const changed = await api.put(`/customers/${phone}/vip`, mgr.auth, { code: "GOLDVIP", type: "percent", value: 15 });
    assert.equal(changed.body.data.claimedAt, null, "a new code has to be typed by the customer again");
    assert.equal(await prisma.vipCode.count(), 1, "one VIP code per customer");

    assert.equal((await api.del(`/customers/${phone}/vip`, mgr.auth)).status, 200);
    assert.equal((await api.del(`/customers/${phone}/vip`, mgr.auth)).status, 404);
    assert.equal((await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data.vip, null);
    assert.equal(await prisma.adminAuditLog.count({ where: { entity: "customer", entityId: phone, action: { in: ["vip-give", "vip-update", "vip-remove"] } } }), 4);
  });

  it("checks the code and the amount, refuses a normal promo code's name, and is for managers and owners", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    const fd = await staff("frontdesk");
    await prisma.settings.create({ data: { key: "promoCodes", value: promoList(["TIHAR20"]) } });
    const put = (b: object) => api.put(`/customers/${phone}/vip`, mgr.auth, b);
    assert.equal((await put({ code: "AB", type: "percent", value: 10 })).status, 400, "too short");
    assert.equal((await put({ code: "bad code!", type: "percent", value: 10 })).status, 400);
    assert.equal((await put({ code: "ADMINVIP", type: "percent", value: 0 })).status, 400);
    assert.equal((await put({ code: "ADMINVIP", type: "percent", value: 101 })).status, 400);
    assert.equal((await put({ code: "ADMINVIP", type: "flat", value: 100001 })).status, 400);
    assert.equal((await put({ code: "ADMINVIP", type: "cash", value: 10 })).status, 400);
    assert.equal((await put({ code: "tihar20", type: "percent", value: 10 })).status, 409, "already a normal promo code");
    assert.equal((await api.put("/customers/9000000000/vip", mgr.auth, body)).status, 404);
    assert.equal((await api.put(`/customers/${phone}/vip`, fd.auth, body)).status, 403);
    assert.equal(await prisma.vipCode.count(), 0);
  });
});
