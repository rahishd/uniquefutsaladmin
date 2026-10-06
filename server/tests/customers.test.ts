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
    assert.deepEqual(row.stats, { gamesPlayed: 2, gamezoneSessions: 1, paidTotal: 2500, unpaidTotal: 700, openComplaints: 1 });
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
    await prisma.settings.create({ data: { key: "promoCodes", value: promoList(["TIHAR20", "WEEKEND10"]) } });

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
    assert.deepEqual(p.promos.codes.map((c: { code: string; enabled: boolean }) => [c.code, c.enabled]), [["TIHAR20", true], ["WEEKEND10", true]]);
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

  it("promo codes can be switched off and on for one customer, are remembered, and are audited", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    const acc = await staff("accountant");
    await prisma.settings.create({ data: { key: "promoCodes", value: promoList(["TIHAR20"]) } });
    const off = await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "tihar20", enabled: false });
    assert.equal(off.status, 200);
    assert.deepEqual(off.body.data.disabled, ["TIHAR20"]);
    assert.equal((await prisma.customerPromoRule.findFirstOrThrow({ where: { userId: phone } })).createdBy, mgr.id);
    await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "TIHAR20", enabled: false }); // twice keeps one row
    assert.equal(await prisma.customerPromoRule.count({ where: { userId: phone } }), 1);
    let p = (await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data;
    assert.equal(p.promos.codes[0].enabled, false);

    await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "*", enabled: false });
    p = (await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data;
    assert.equal(p.promos.allOff, true);

    await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "*", enabled: true });
    await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "TIHAR20", enabled: true });
    assert.equal(await prisma.customerPromoRule.count({ where: { userId: phone } }), 0);
    assert.equal((await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data.promos.codes[0].enabled, true);

    assert.equal((await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "NOSUCH", enabled: false })).status, 404);
    assert.equal((await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "bad code!", enabled: false })).status, 400);
    assert.equal((await api.put("/customers/9000000000/promos", mgr.auth, { code: "*", enabled: false })).status, 404);
    assert.equal((await api.put(`/customers/${phone}/promos`, acc.auth, { code: "*", enabled: false })).status, 403);
    assert.equal(await prisma.adminAuditLog.count({ where: { entity: "customer", entityId: phone, action: { in: ["promo-disable", "promo-enable"] } } }), 5);
  });

  it("a code switched off and later removed from the promo list stays visible so staff can clear it", async () => {
    await customer(phone, "Mina Rai");
    const mgr = await staff("manager");
    await prisma.settings.create({ data: { key: "promoCodes", value: promoList(["OLDCODE"]) } });
    await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "OLDCODE", enabled: false });
    await prisma.settings.update({ where: { key: "promoCodes" }, data: { value: promoList([]) } });
    const p = (await api.get(`/customers/${phone}/profile`, mgr.auth)).body.data;
    assert.deepEqual(p.promos.codes.map((c: { code: string; enabled: boolean }) => [c.code, c.enabled]), [["OLDCODE", false]]);
    assert.equal((await api.put(`/customers/${phone}/promos`, mgr.auth, { code: "OLDCODE", enabled: true })).status, 200);
    assert.equal(await prisma.customerPromoRule.count(), 0);
  });
});
