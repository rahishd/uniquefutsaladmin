import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, app, customer, customerToken, PASSWORD, prisma, request, reset, staff, todayKey } from "./helpers";

const today = todayKey();
const tomorrow = addDaysKey(today, 1);

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

describe("auth and access", () => {
  it("logs in, rejects a wrong password, and never reveals which part was wrong", async () => {
    await staff("owner");
    const ok = await request(app).post("/api/admin/auth/login").send({ email: "owner@test.np", password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.token);
    assert.equal(ok.body.data.admin.passwordHash, undefined);
    const bad = await request(app).post("/api/admin/auth/login").send({ email: "owner@test.np", password: "nope" });
    const none = await request(app).post("/api/admin/auth/login").send({ email: "ghost@test.np", password: "nope" });
    assert.equal(bad.status, 401);
    assert.equal(none.status, 401);
    assert.equal(bad.body.message, none.body.message);
  });

  it("needs a token, and a customer token is not a staff token", async () => {
    assert.equal((await request(app).get("/api/admin/bookings")).status, 401);
    await customer("9800000001");
    const r = await request(app).get("/api/admin/bookings").set({ Authorization: `Bearer ${customerToken("9800000001")}` });
    assert.equal(r.status, 401);
  });

  it("a disabled staff member loses access at once", async () => {
    const owner = await staff("owner");
    const fd = await staff("frontdesk");
    assert.equal((await api.get("/bookings", fd.auth)).status, 200);
    assert.equal((await api.patch(`/staff/${fd.id}`, owner.auth, { isActive: false })).status, 200);
    assert.equal((await api.get("/bookings", fd.auth)).status, 401);
  });

  it("enforces roles: front desk cannot manage staff, adjust points, or edit prices; accountant cannot book", async () => {
    const fd = await staff("frontdesk");
    const acc = await staff("accountant");
    assert.equal((await api.get("/staff", fd.auth)).status, 403);
    assert.equal((await api.post("/loyalty/adjust", fd.auth, { phone: "9800000001", points: 5, reason: "goodwill gift" })).status, 403);
    assert.equal((await api.put("/courts/pricing", fd.auth, { hourlyRate: 1000 })).status, 403);
    assert.equal((await api.post("/bookings/walk-in", acc.auth, { date: tomorrow, startTime: "10:00", customerName: "Ram" })).status, 403);
    assert.equal((await api.get("/reports/revenue", acc.auth)).status, 200);
  });

  it("protects the last owner and your own account", async () => {
    const owner = await staff("owner");
    assert.equal((await api.patch(`/staff/${owner.id}`, owner.auth, { accountType: "staff" })).status, 400);
    assert.equal((await api.patch(`/staff/${owner.id}`, owner.auth, { isActive: false })).status, 400);
    const made = await api.post("/staff", owner.auth, { email: "m@test.np", name: "Mina", accountType: "admin", password: "another-long-pass" });
    assert.equal(made.status, 201);
    assert.equal(made.body.data.passwordHash, undefined);
    assert.equal((await api.post("/staff", owner.auth, { email: "m@test.np", name: "Mina", accountType: "admin", password: "another-long-pass" })).status, 409);
    assert.equal((await api.post("/staff", owner.auth, { email: "x@test.np", name: "Xi", accountType: "staff", password: "short" })).status, 400);
  });
});

describe("bookings", () => {
  it("walk-in books an hour once; the same hour is refused; cancelling frees it; writes are audited", async () => {
    await prisma.settings.create({ data: { key: "hourlyRate", value: "1200" } });
    const fd = await staff("frontdesk");
    const body = { date: tomorrow, startTime: "18:00", duration: 2, customerName: "Ram Karki", customerPhone: "9811111111", paid: true };
    const a = await api.post("/bookings/walk-in", fd.auth, body);
    assert.equal(a.status, 201);
    assert.equal(a.body.data.totalPrice, 2400);
    assert.match(a.body.data.code, /^UF-/);
    assert.equal((await api.post("/bookings/walk-in", fd.auth, { ...body, startTime: "19:00", duration: 1 })).status, 409);
    assert.equal((await prisma.bookingSlot.count({ where: { date: tomorrow } })), 2);
    assert.equal((await api.post(`/bookings/${a.body.data.id}/cancel`, fd.auth, {})).status, 200);
    assert.equal(await prisma.bookingSlot.count({ where: { date: tomorrow } }), 0);
    assert.equal((await prisma.booking.findUnique({ where: { id: a.body.data.id } }))?.status, "cancelled", "the record is kept");
    assert.equal((await api.post(`/bookings/${a.body.data.id}/cancel`, fd.auth, {})).status, 409);
    assert.equal((await api.post("/bookings/walk-in", fd.auth, body)).status, 201);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "booking" } })) >= 3);
  });

  it("refuses dates far away and bad input; a game that already happened is logged as completed and earns points once", async () => {
    const fd = await staff("frontdesk");
    assert.equal((await api.post("/bookings/walk-in", fd.auth, { date: addDaysKey(today, -90), startTime: "10:00", customerName: "Ram" })).status, 400);
    assert.equal((await api.post("/bookings/walk-in", fd.auth, { date: addDaysKey(today, 90), startTime: "10:00", customerName: "Ram" })).status, 400);
    assert.equal((await api.post("/bookings/walk-in", fd.auth, { date: tomorrow, startTime: "10:30", customerName: "Ram" })).status, 400);
    await customer("9877000001");
    const retro = await api.post("/bookings/walk-in", fd.auth, { date: addDaysKey(today, -1), startTime: "10:00", customerName: "Ram", customerPhone: "9877000001", paid: true, priceOverride: 1150 });
    assert.equal(retro.status, 201);
    assert.equal(retro.body.data.status, "completed");
    assert.equal(Number((await prisma.loyaltyEntry.findFirstOrThrow({ where: { userId: "9877000001" } })).points), 11.5);
    assert.equal((await api.post("/bookings/walk-in", fd.auth, { date: tomorrow, startTime: "10:00", customerName: "Ram", customerPhone: "123" })).status, 400);
  });

  it("a paid game earns points exactly once; guests and unpaid bookings earn none", async () => {
    await customer("9822222222");
    const fd = await staff("frontdesk");
    // Yesterday's hours have passed, so these are logged as completed.
    const mk = (startTime: string, extra: object) => api.post("/bookings/walk-in", fd.auth, { date: addDaysKey(today, -1), startTime, customerName: "Sita", customerPhone: "9822222222", ...extra });
    const paid = (await mk("06:00", { paid: true, priceOverride: 1250 })).body.data;
    assert.equal(paid.status, "completed");
    const entries = await prisma.loyaltyEntry.findMany({ where: { userId: "9822222222" } });
    assert.equal(entries.length, 1);
    assert.equal(Number(entries[0].points), 12.5);
    assert.equal((await api.post(`/bookings/${paid.id}/complete`, fd.auth)).status, 409, "already completed");
    assert.equal(await prisma.loyaltyEntry.count(), 1);

    await mk("07:00", { priceOverride: 1000 }); // unpaid
    await api.post("/bookings/walk-in", fd.auth, { date: addDaysKey(today, -1), startTime: "08:00", customerName: "Guest", paid: true, priceOverride: 1000 }); // guest
    assert.equal(await prisma.loyaltyEntry.count(), 1);

    // A confirmed paid game completed by hand awards points exactly once.
    const live = await prisma.booking.create({ data: { userId: "9822222222", date: today, startTime: "05:00", endTime: "06:00", duration: 1, customerName: "Sita", basePrice: 900, subtotal: 900, totalPrice: 900, paymentMethod: "venue", status: "confirmed", paymentStatus: "completed", code: "UF-LIVE1" } });
    const done = await api.post(`/bookings/${live.id}/complete`, fd.auth);
    assert.equal(done.body.data.pointsAwarded, true);
    assert.equal((await api.post(`/bookings/${live.id}/complete`, fd.auth)).status, 409);
    assert.equal(await prisma.loyaltyEntry.count(), 2);
  });

  it("a future game cannot be completed or marked no-show", async () => {
    const fd = await staff("frontdesk");
    const b = (await api.post("/bookings/walk-in", fd.auth, { date: tomorrow, startTime: "10:00", customerName: "Ram" })).body.data;
    assert.equal((await api.post(`/bookings/${b.id}/complete`, fd.auth)).status, 400);
    assert.equal((await api.post(`/bookings/${b.id}/no-show`, fd.auth)).status, 400);
  });

  it("mark-paid settles an online hold and cancel of a paid online order creates a refund to record once", async () => {
    await customer("9833333333");
    const fd = await staff("frontdesk");
    const b = await prisma.booking.create({ data: { userId: "9833333333", date: tomorrow, startTime: "17:00", endTime: "18:00", duration: 1, customerName: "Hari", basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "esewa", status: "pending", paymentOrderCode: "UF-ORDER1", holdExpiresAt: new Date(Date.now() + 600000), code: "UF-ORDER1" } });
    await prisma.paymentOrder.create({ data: { orderCode: "UF-ORDER1", purpose: "game", userId: "9833333333", method: "esewa", amount: 1500, remarks: "Regular game - UF-ORDER1", expiresAt: new Date(Date.now() + 600000) } });
    assert.equal((await api.post(`/payments/UF-ORDER1/mark-paid`, fd.auth)).status, 200);
    const paid = await prisma.booking.findUnique({ where: { id: b.id } });
    assert.equal(paid?.paymentStatus, "completed");
    assert.equal(paid?.status, "confirmed");
    assert.equal((await api.post(`/payments/UF-ORDER1/mark-paid`, fd.auth)).status, 409);

    assert.equal((await api.post(`/bookings/${b.id}/cancel`, fd.auth, { reason: "Rain" })).status, 200);
    const due = await api.get("/payments/refunds?status=due", fd.auth);
    assert.equal(due.body.data.length, 1);
    assert.equal(due.body.data[0].orderCode, "UF-ORDER1");
    assert.equal((await api.post("/payments/UF-ORDER1/refund", fd.auth, { method: "esewa", reference: "TXN1" })).status, 200);
    assert.equal((await api.post("/payments/UF-ORDER1/refund", fd.auth, { method: "esewa" })).status, 409);
    assert.equal((await api.get("/payments/refunds?status=due", fd.auth)).body.data.length, 0);
    assert.equal(await prisma.notification.count({ where: { userId: "9833333333", type: "booking" } }), 1);
  });
});

describe("courts, promos, loyalty, customers", () => {
  it("blocked hours cannot be booked, and unblocking frees them", async () => {
    const mgr = await staff("manager");
    const blk = await api.post("/courts/blocks", mgr.auth, { date: tomorrow, hours: [10, 11], reason: "Floor repair" });
    assert.equal(blk.status, 201);
    assert.equal((await api.post("/bookings/walk-in", mgr.auth, { date: tomorrow, startTime: "11:00", customerName: "Ram" })).status, 409);
    assert.equal((await api.post("/courts/blocks", mgr.auth, { date: tomorrow, hours: [11, 12], reason: "Overlap" })).status, 409);
    assert.equal(await prisma.slotBlock.count({ where: { hour: 12 } }), 0, "a failed block leaves nothing behind");
    const day = await api.get(`/courts/slots?date=${tomorrow}`, mgr.auth);
    assert.equal(day.body.data.hours[10].state, "blocked");
    assert.equal(day.body.data.hours[9].state, "free");
    assert.equal((await api.del(`/courts/blocks/${blk.body.data[0].id}`, mgr.auth)).status, 200);
    assert.equal((await api.post("/bookings/walk-in", mgr.auth, { date: tomorrow, startTime: "10:00", customerName: "Ram" })).status, 201);
  });

  it("pricing writes the same Settings keys the customer app reads", async () => {
    const mgr = await staff("manager");
    await api.put("/courts/pricing", mgr.auth, { hourlyRate: 1000, hours: [{ hour: 18, price: 1500 }] });
    const stored = JSON.parse((await prisma.settings.findUnique({ where: { key: "hourlyPricing" } }))!.value);
    assert.deepEqual(stored, [{ id: "ts-18", time: "18:00", price: 1500 }]);
    const w = await api.post("/bookings/walk-in", mgr.auth, { date: tomorrow, startTime: "18:00", customerName: "Ram" });
    assert.equal(w.body.data.totalPrice, 1500);
  });

  it("promo codes: create, no duplicates, validate, update, remove", async () => {
    const mgr = await staff("manager");
    const p = { code: "tihar20", type: "percent", value: 20, label: "20% off", appliedTo: "booking" };
    const made = await api.post("/promos", mgr.auth, p);
    assert.equal(made.status, 201);
    assert.equal(made.body.data.code, "TIHAR20");
    assert.equal((await api.post("/promos", mgr.auth, p)).status, 409);
    assert.equal((await api.post("/promos", mgr.auth, { ...p, code: "BIG", value: 150 })).status, 400);
    assert.equal((await api.put("/promos/TIHAR20", mgr.auth, { ...p, value: 25 })).status, 200);
    assert.equal((await api.get("/promos", mgr.auth)).body.data[0].value, 25);
    assert.equal((await api.del("/promos/TIHAR20", mgr.auth)).status, 200);
    assert.equal((await api.get("/promos", mgr.auth)).body.data.length, 0);
  });

  it("goods sale awards Rs.100 = 1 point; only managers adjust; vouchers can be voided once", async () => {
    await customer("9844444444");
    const fd = await staff("frontdesk");
    const mgr = await staff("manager");
    const sale = await api.post("/loyalty/goods-sale", fd.auth, { phone: "9844444444", amount: 1050, items: "Water x5" });
    assert.equal(sale.body.data.points, 10);
    assert.equal((await api.post("/loyalty/goods-sale", fd.auth, { phone: "9855555555", amount: 500 })).status, 404);
    assert.equal((await api.post("/loyalty/adjust", mgr.auth, { phone: "9844444444", points: -3, reason: "Wrong sale entered" })).status, 200);
    const l = await api.get("/loyalty/customers/9844444444", fd.auth);
    assert.equal(l.body.data.approxBalance, 7);
    const v = await prisma.freeGameVoucher.create({ data: { userId: "9844444444", period: "Day", cost: 125 } });
    assert.equal((await api.post(`/loyalty/vouchers/${v.id}/void`, mgr.auth)).status, 200);
    assert.equal((await api.post(`/loyalty/vouchers/${v.id}/void`, mgr.auth)).status, 409);
  });

  it("customers: search, never expose the password, suspend and reactivate", async () => {
    await customer("9866666666", "Gita Rai");
    const fd = await staff("frontdesk");
    const list = await api.get("/customers?q=gita", fd.auth);
    assert.equal(list.body.data.total, 1);
    assert.equal(JSON.stringify(list.body).includes("password"), false);
    const detail = await api.get("/customers/9866666666", fd.auth);
    assert.equal(JSON.stringify(detail.body).includes("hash-not-exposed"), false);
    assert.equal((await api.post("/customers/9866666666/suspend", fd.auth)).status, 403, "front desk cannot suspend");
    const mgr = await staff("manager");
    assert.equal((await api.post("/customers/9866666666/suspend", mgr.auth)).status, 200);
    assert.equal((await prisma.user.findUnique({ where: { phoneNumber: "9866666666" } }))?.isActive, false);
    assert.equal((await api.post("/customers/9866666666/unsuspend", mgr.auth)).status, 200);
  });
});

describe("gamezone, teams, notices, reports", () => {
  it("gamezone: mark paid, cancel a paid session creates a refund and frees the console hour", async () => {
    const fd = await staff("frontdesk");
    await prisma.gzBooking.create({ data: { code: "GZ-1", guestName: "Bikash", guestPhone: "9877777777", consoleId: "c1", gameTitle: "FIFA 26", date: tomorrow, startHour: 14, hours: 1, players: 2, total: 400, paymentMethod: "esewa", status: "confirmed" } });
    await prisma.gzSlot.create({ data: { consoleId: "c1", date: tomorrow, hour: 14, bookingCode: "GZ-1" } });
    await prisma.paymentOrder.create({ data: { orderCode: "GZ-1", purpose: "gamezone", method: "esewa", amount: 400, remarks: "Gamezone PS5 - GZ-1", expiresAt: new Date(Date.now() + 600000) } });
    assert.equal((await api.post("/gamezone/bookings/GZ-1/mark-paid", fd.auth)).status, 200);
    assert.equal((await api.post("/gamezone/bookings/GZ-1/mark-paid", fd.auth)).status, 409);
    assert.equal((await api.post("/gamezone/bookings/GZ-1/cancel", fd.auth)).status, 200);
    assert.equal(await prisma.gzSlot.count(), 0);
    assert.equal((await api.get("/payments/refunds?status=due", fd.auth)).body.data.length, 1);
  });

  it("gamezone catalog: duplicate names refused, plans only for 1, 2 or 4 players", async () => {
    const mgr = await staff("manager");
    assert.equal((await api.post("/gamezone/consoles", mgr.auth, { name: "PS5 Station 1" })).status, 201);
    assert.equal((await api.post("/gamezone/consoles", mgr.auth, { name: "PS5 Station 1" })).status, 409);
    assert.equal((await api.put("/gamezone/plans/2", mgr.auth, { label: "2 players", ratePerPersonHour: 200 })).status, 200);
    assert.equal((await api.put("/gamezone/plans/3", mgr.auth, { label: "3 players", ratePerPersonHour: 200 })).status, 400);
  });

  it("disputes: approve awards the winning captain 5 points once; void removes the result", async () => {
    await customer("9810000001"); await customer("9810000002");
    const a = await prisma.team.create({ data: { name: "Reds", captainId: "9810000001" } });
    const b = await prisma.team.create({ data: { name: "Blues", captainId: "9810000002" } });
    const ch = await prisma.challenge.create({ data: { challengerTeamId: a.id, challengedTeamId: b.id, type: "match", date: today, startHour: 18, courtPrice: 2000, loserPct: 70, status: "accepted" } });
    const r = await prisma.challengeResult.create({ data: { challengeId: ch.id, submittedByTeamId: a.id, scoreSubmitter: 3, scoreOther: 1, status: "disputed" } });
    const fd = await staff("frontdesk");
    const list = await api.get("/teams/disputes", fd.auth);
    assert.equal(list.body.data.length, 1);
    assert.equal((await api.post(`/teams/results/${r.id}/resolve`, fd.auth, { action: "approve", scoreSubmitter: 1, scoreOther: 4 })).status, 400);
    assert.equal((await api.post(`/teams/results/${r.id}/resolve`, fd.auth, { action: "approve", scoreSubmitter: 2, scoreOther: 1, note: "Checked CCTV" })).status, 200);
    const pts = await prisma.loyaltyEntry.findMany({ where: { userId: "9810000001", kind: "captain_win" } });
    assert.equal(pts.length, 1);
    assert.equal(Number(pts[0].points), 5);
    assert.equal((await api.post(`/teams/results/${r.id}/resolve`, fd.auth, { action: "approve" })).status, 409);
    const s = await api.get(`/teams/settlements?date=${today}`, fd.auth);
    assert.deepEqual(s.body.data[0].split, { challenger: 600, challenged: 1400, basis: "loser pays 70%" });
    assert.equal((await api.post(`/teams/challenges/${ch.id}/venue-paid`, fd.auth)).status, 200);
    assert.equal(await prisma.notification.count({ where: { type: "match", title: { contains: "Did you win" } } }), 2);

    const r2 = await prisma.challengeResult.create({ data: { challengeId: ch.id, submittedByTeamId: b.id, scoreSubmitter: 1, scoreOther: 0, status: "disputed" } });
    assert.equal((await api.post(`/teams/results/${r2.id}/resolve`, fd.auth, { action: "void" })).status, 200);
    assert.equal(await prisma.challengeResult.count({ where: { id: r2.id } }), 0);
  });

  it("broadcast respects promo opt-outs and inactive customers", async () => {
    await customer("9820000001"); await customer("9820000002"); await customer("9820000003");
    await prisma.userPrefs.create({ data: { userId: "9820000002", promoNotifications: false } });
    await prisma.user.update({ where: { phoneNumber: "9820000003" }, data: { isActive: false } });
    const mgr = await staff("manager");
    const promo = await api.post("/notifications/broadcast", mgr.auth, { type: "promo", title: "Tihar offer", message: "20% off this week", href: "/promos" });
    assert.equal(promo.body.data.sent, 1);
    const general = await api.post("/notifications/broadcast", mgr.auth, { type: "general", title: "Closed Friday", message: "Venue closed for Dashain" });
    assert.equal(general.body.data.sent, 2);
    assert.equal((await api.post("/notifications/broadcast", mgr.auth, { type: "promo", title: "x", message: "bad link", href: "https://evil.example" })).status, 400);
  });

  it("dashboard, revenue report and audit log work; the audit log never holds passwords", async () => {
    const owner = await staff("owner");
    await api.post("/bookings/walk-in", owner.auth, { date: today, startTime: "09:00", customerName: "Ram", paid: true, priceOverride: 1000 });
    const dash = await api.get("/dashboard", owner.auth);
    assert.equal(dash.body.data.bookingsToday, 1);
    assert.equal(dash.body.data.revenueToday, 1000);
    const rev = await api.get(`/reports/revenue?from=${today}&to=${today}`, owner.auth);
    assert.equal(rev.body.data.totals.cash, 1000);
    assert.equal((await api.get(`/reports/revenue?from=2020-01-01&to=${today}`, owner.auth)).status, 400);
    await api.post("/staff", owner.auth, { email: "n@test.np", name: "Nima", accountType: "staff", permissions: ["bookings.read"], password: "secret-password-1" });
    const log = await api.get("/audit?entity=staff", owner.auth);
    assert.ok(log.body.data.total >= 2);
    assert.equal(JSON.stringify(log.body).includes("secret-password-1"), false);
    assert.equal(JSON.stringify(log.body).includes("passwordHash"), false);
  });
});

describe("bookings list scopes", () => {
  it("splits upcoming, today and previous, orders them, searches, and hides membership ledger rows", async () => {
    const fd = await staff("frontdesk");
    const mk = (date: string, startTime: string, extra: object = {}) => prisma.booking.create({ data: { date, startTime, endTime: "23:00", duration: 1, customerName: "Ram", customerPhone: "9811111111", basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "confirmed", code: `UF-${date}-${startTime}`, ...extra } });
    await mk(addDaysKey(today, 2), "10:00");
    await mk(addDaysKey(today, 1), "18:00");
    await mk(today, "20:00");
    await mk(today, "07:00", { customerName: "Sita" });
    await mk(addDaysKey(today, -1), "09:00", { status: "completed" });
    await mk(addDaysKey(today, -3), "09:00", { status: "cancelled" });
    await mk(today, "12:00", { notes: "MEMBERSHIP_PAYMENT ledger", paymentMethod: "membership" });

    const up = (await api.get("/bookings?scope=upcoming", fd.auth)).body.data;
    assert.deepEqual(up.items.map((b: { date: string }) => b.date), [addDaysKey(today, 1), addDaysKey(today, 2)], "soonest first");
    const td = (await api.get("/bookings?scope=today", fd.auth)).body.data;
    assert.deepEqual(td.items.map((b: { startTime: string }) => b.startTime), ["07:00", "20:00"], "by start time, ledger row hidden");
    const prev = (await api.get("/bookings?scope=previous", fd.auth)).body.data;
    assert.deepEqual(prev.items.map((b: { date: string }) => b.date), [addDaysKey(today, -1), addDaysKey(today, -3)], "newest first");
    assert.equal((await api.get("/bookings?scope=previous&status=cancelled", fd.auth)).body.data.total, 1);
    assert.equal((await api.get("/bookings?scope=today&q=sita", fd.auth)).body.data.total, 1);
    assert.deepEqual((await api.get("/bookings/counts", fd.auth)).body.data, { upcoming: 2, today: 2, previous: 2 });
    assert.equal((await api.get("/bookings?scope=today&limit=1&page=2", fd.auth)).body.data.items.length, 1);
  });
});

describe("booking calendar", () => {
  it("counts live bookings per day for a month and ignores cancelled ones", async () => {
    const fd = await staff("frontdesk");
    const mk = (date: string, startTime: string, status = "confirmed") => prisma.booking.create({ data: { date, startTime, endTime: "23:00", duration: 1, customerName: "Ram", basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status, code: `UF-CAL-${date}-${startTime}` } });
    await mk("2026-03-10", "10:00"); await mk("2026-03-10", "11:00"); await mk("2026-03-10", "12:00", "cancelled"); await mk("2026-03-21", "10:00"); await mk("2026-04-01", "10:00");
    const r = await api.get("/bookings/calendar?month=2026-03", fd.auth);
    assert.deepEqual(r.body.data.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)), [{ date: "2026-03-10", count: 2 }, { date: "2026-03-21", count: 1 }]);
    assert.equal((await api.get("/bookings/calendar?month=nope", fd.auth)).status, 400);
  });
});

describe("payments ledger", () => {
  const mk = (n: number, paymentMethod: string, extra: object = {}) => prisma.booking.create({ data: { date: today, startTime: `${String(5 + n).padStart(2, "0")}:00`, endTime: "23:00", duration: 1, customerName: `Cust ${n}`, customerPhone: `98000000${String(n).padStart(2, "0")}`, basePrice: 1000, subtotal: 1000, totalPrice: 1000 + n, paymentMethod, status: "confirmed", paymentStatus: "pending", code: `UF-LED${n}`, ...extra } });

  it("shows paid, unpaid and cancelled with cash/online modes, filters and totals; membership ledger rows are not payments", async () => {
    const acc = await staff("accountant");
    await mk(1, "venue", { paymentStatus: "completed" });            // paid cash 1001
    await mk(2, "venue", { paymentStatus: "completed" });            // paid cash 1002
    await mk(3, "esewa", { paymentStatus: "completed" });            // paid esewa 1003
    await mk(4, "fonepay", { paymentStatus: "completed" });          // paid fonepay 1004
    await mk(5, "venue");                                            // unpaid cash 1005
    await mk(6, "esewa");                                            // unpaid online 1006
    await mk(7, "esewa", { status: "cancelled" });                   // cancelled
    await mk(8, "membership", { notes: "MEMBERSHIP_PAYMENT", paymentStatus: "completed" }); // not a payment

    const all = (await api.get("/payments/ledger", acc.auth)).body.data;
    assert.equal(all.total, 7);
    const by = (q: string) => api.get(`/payments/ledger?${q}`, acc.auth).then((r) => r.body.data);
    assert.equal((await by("status=paid")).total, 4);
    assert.equal((await by("status=unpaid")).total, 2);
    assert.equal((await by("status=cancelled")).total, 1);
    assert.equal((await by("mode=cash")).total, 3);
    assert.equal((await by("mode=online")).total, 4);
    assert.equal((await by("mode=fonepay")).total, 1);
    assert.equal((await by("status=unpaid&mode=cash")).items[0].code, "UF-LED5");
    assert.equal((await by("q=cust 3")).items[0].method, "esewa");
    assert.deepEqual((await by("status=paid&mode=cash")).items.map((i: { mode: string }) => i.mode), ["cash", "cash"]);

    const s = (await api.get("/payments/summary", acc.auth)).body.data;
    assert.deepEqual(s.paid, { sum: 1001 + 1002 + 1003 + 1004, count: 4 });
    assert.deepEqual(s.paidCash, { sum: 2003, count: 2 });
    assert.deepEqual(s.paidOnline, { sum: 2007, count: 2 });
    assert.deepEqual(s.unpaid, { sum: 1005 + 1006, count: 2 });
    assert.equal(s.cancelled, 1);
    assert.equal((await api.get("/payments/summary?mode=cash", acc.auth)).body.data.unpaid.sum, 1005);
    assert.equal((await api.get("/payments/ledger?status=nope", acc.auth)).status, 400);
  });

  it("collecting an unpaid booking moves it to paid and records how it was really paid", async () => {
    const fd = await staff("frontdesk");
    const b = await mk(5, "venue");
    assert.equal((await api.post(`/bookings/${b.id}/mark-paid`, fd.auth, { method: "esewa" })).status, 200);
    const row = (await api.get("/payments/ledger?q=UF-LED5", fd.auth)).body.data.items[0];
    assert.equal(row.status, "paid");
    assert.equal(row.method, "esewa");
    assert.equal(row.mode, "online");
    assert.equal((await api.get("/payments/summary", fd.auth)).body.data.unpaid.count, 0);
  });

  it("gamezone sessions use the same statuses and modes", async () => {
    const fd = await staff("frontdesk");
    const gz = (code: string, paymentMethod: string, paymentStatus: string, status = "confirmed") => prisma.gzBooking.create({ data: { code, guestName: code, guestPhone: "9877000000", consoleId: "c1", gameTitle: "FIFA", date: today, startHour: 14, hours: 1, players: 2, total: 400, paymentMethod, paymentStatus, status } });
    await gz("GZ-A", "venue", "pay_at_venue");
    await gz("GZ-B", "esewa", "paid");
    await gz("GZ-C", "fonepay", "pending", "expired");
    const l = (await api.get("/payments/ledger?kind=gamezone", fd.auth)).body.data;
    assert.equal(l.total, 3);
    assert.deepEqual(Object.fromEntries(l.items.map((i: { code: string; status: string }) => [i.code, i.status])), { "GZ-A": "unpaid", "GZ-B": "paid", "GZ-C": "cancelled" });
    const s = (await api.get("/payments/summary?kind=gamezone", fd.auth)).body.data;
    assert.deepEqual(s.paidOnline, { sum: 400, count: 1 });
    assert.deepEqual(s.unpaidCash, { sum: 400, count: 1 });
  });
});

describe("arrivals", () => {
  it("lists today's live bookings and sessions with who has checked in; cancelled, other days and ledger rows are left out", async () => {
    await customer("9890000001", "Registered Rita");
    const fd = await staff("frontdesk");
    const mk = (code: string, startTime: string, extra: object = {}) => prisma.booking.create({ data: { date: today, startTime, endTime: "23:00", duration: 1, customerName: code, basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "confirmed", code, ...extra } });
    const a = await mk("UF-ARR1", "18:00", { paymentStatus: "completed" });
    await mk("UF-ARR2", "19:00");
    await mk("UF-ARR3", "20:00", { status: "cancelled" });
    await mk("UF-ARR4", "21:00", { date: tomorrow });
    await mk("UF-ARR5", "12:00", { notes: "MEMBERSHIP_PAYMENT", paymentMethod: "membership" });
    await mk("UF-ARR6", "17:00", { customerName: null, userId: "9890000001" });
    await prisma.gzBooking.create({ data: { code: "GZ-ARR", guestName: "Gamer", guestPhone: "9877000009", consoleId: "c1", gameTitle: "FIFA", date: today, startHour: 15, hours: 2, players: 2, total: 800, paymentMethod: "esewa", paymentStatus: "paid", status: "confirmed" } });
    await prisma.arrivalCheckin.create({ data: { refId: a.id, userId: "9800000001" } });
    await prisma.arrivalCheckin.create({ data: { refId: "GZ-ARR", userId: "9877000009" } });

    const r = (await api.get("/arrivals", fd.auth)).body.data;
    assert.equal(r.date, today);
    assert.ok(Number.isInteger(r.nowMinutes) && r.nowMinutes >= 0 && r.nowMinutes < 1440);
    assert.deepEqual(r.items.map((i: { code: string }) => i.code), ["GZ-ARR", "UF-ARR6", "UF-ARR1", "UF-ARR2"], "sorted by start time");
    const by = Object.fromEntries(r.items.map((i: { code: string }) => [i.code, i]));
    assert.ok(by["UF-ARR1"].checkedInAt && by["GZ-ARR"].checkedInAt);
    assert.equal(by["UF-ARR2"].checkedInAt, null);
    assert.equal(by["UF-ARR1"].paid, true);
    assert.equal(by["UF-ARR2"].paid, false);
    assert.equal(by["UF-ARR6"].name, "Registered Rita", "a registered customer's name is looked up");
    assert.equal(by["GZ-ARR"].endTime, "17:00");
    assert.equal(by["GZ-ARR"].kind, "gamezone");
  });
});

describe("price validation", () => {
  it("refuses prices below Rs. 100", async () => {
    const mgr = await staff("manager");
    assert.equal((await api.put("/courts/pricing", mgr.auth, { hours: [{ hour: 18, price: 0 }] })).status, 400);
    assert.equal((await api.put("/courts/pricing", mgr.auth, { hourlyRate: 50 })).status, 400);
    assert.equal((await api.put("/courts/pricing", mgr.auth, { hours: [{ hour: 18, price: 1350 }] })).status, 200);
  });
});

describe("membership plans", () => {
  const none = { price: null, discount: 0 };
  const matrix = (over: Record<string, Record<string, { price: number | null; discount: number }>> = {}) => ({
    morning: { "1_month": { price: 6000, discount: 500 }, "3_months": { price: 16000, discount: 0 }, "6_months": { price: 30000, discount: 2000 } },
    day: { "1_month": { price: 5000, discount: 0 }, "3_months": none, "6_months": none },
    evening: { "1_month": none, "3_months": none, "6_months": none },
    ...over,
  });
  const plan = (extra: object = {}) => ({ name: "Premium", description: "Best value", perks: ["Priority booking", "Free water"], featured: false, isActive: true, matrix: matrix(), ...extra });

  it("saves each shift and length in the columns the customer app reads, including 6 months", async () => {
    const mgr = await staff("manager");
    const r = await api.post("/membership/plans", mgr.auth, plan());
    assert.equal(r.status, 201);
    const row = (await prisma.membershipPlan.findUniqueOrThrow({ where: { id: r.body.data.id } })) as unknown as Record<string, unknown>;
    assert.equal(row.price1MonthMorning, 6000);
    assert.equal(row.discount1MonthMorning, 500);
    assert.equal(row.price3MonthsMorning, 16000);
    assert.equal(row.price6MonthsMorning, 30000);
    assert.equal(row.discount6MonthsMorning, 2000);
    assert.equal(row.price1MonthDay, 5000);
    assert.equal(row.price3MonthsDay, null);
    assert.equal(row.price, 5000, "legacy price = cheapest 1-month price (the app lists plans by it)");
    assert.equal(row.perks, JSON.stringify(["Priority booking", "Free water"]));
    const list = (await api.get("/membership/plans", mgr.auth)).body.data;
    assert.equal(list[0].matrix.morning["1_month"].customerPays, 5500, "price minus discount, like the customer app");
    assert.equal(list[0].matrix.morning["6_months"].customerPays, 28000);
    assert.equal(list[0].matrix.evening["1_month"].customerPays, null);
    assert.deepEqual(list[0].perks, ["Priority booking", "Free water"]);
  });

  it("only one plan is featured; edits replace the prices; retiring keeps the plan", async () => {
    const mgr = await staff("manager");
    const a = (await api.post("/membership/plans", mgr.auth, plan({ name: "Basic", featured: true }))).body.data;
    const b = (await api.post("/membership/plans", mgr.auth, plan({ name: "Premium", featured: true }))).body.data;
    assert.equal((await prisma.membershipPlan.findUniqueOrThrow({ where: { id: a.id } })).featured, false);
    const upd = await api.put(`/membership/plans/${b.id}`, mgr.auth, plan({ name: "Premium", featured: true, isActive: false, matrix: matrix({ evening: { "1_month": { price: 4500, discount: 0 }, "3_months": none, "6_months": none } }) }));
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.matrix.evening["1_month"].price, 4500);
    assert.equal(upd.body.data.isActive, false);
    assert.equal(await prisma.membershipPlan.count(), 2, "nothing deleted");
    assert.equal((await api.put("/membership/plans/nope", mgr.auth, plan())).status, 404);
  });

  it("rejects bad prices, an active plan with no prices, and staff without permission", async () => {
    const mgr = await staff("manager");
    const fd = await staff("frontdesk");
    assert.equal((await api.post("/membership/plans", mgr.auth, plan({ matrix: matrix({ day: { "1_month": { price: 50, discount: 0 }, "3_months": none, "6_months": none } }) }))).status, 400);
    assert.equal((await api.post("/membership/plans", mgr.auth, plan({ matrix: matrix({ day: { "1_month": { price: 5000, discount: 5000 }, "3_months": none, "6_months": none } }) }))).status, 400);
    const empty = { morning: { "1_month": none, "3_months": none, "6_months": none }, day: { "1_month": none, "3_months": none, "6_months": none }, evening: { "1_month": none, "3_months": none, "6_months": none } };
    assert.equal((await api.post("/membership/plans", mgr.auth, plan({ matrix: empty }))).status, 400);
    assert.equal((await api.post("/membership/plans", mgr.auth, plan({ matrix: empty, isActive: false }))).status, 201, "a draft with no prices is fine while inactive");
    assert.equal((await api.get("/membership/plans", fd.auth)).status, 200);
    assert.equal((await api.post("/membership/plans", fd.auth, plan())).status, 403);
    assert.equal((await api.get("/audit?entity=membership-plan", mgr.auth)).body.data.total, 1);
  });
});

describe("complaints (staff side)", () => {
  const mk = (code: string, extra: object = {}) => prisma.complaint.create({ data: { code, userId: "9860000001", category: "facilities", message: "The floodlight above the left goal keeps flickering.", ...extra } });

  it("lists, filters, searches and counts complaints with the customer's name", async () => {
    await customer("9860000001", "Rita Shrestha");
    const fd = await staff("frontdesk");
    await mk("CP-AAAAA1");
    await mk("CP-AAAAA2", { category: "staff", message: "The desk staff were rude to us.", status: "in_review" });
    await mk("CP-AAAAA3", { status: "resolved", resolvedAt: new Date() });
    const all = (await api.get("/complaints", fd.auth)).body.data;
    assert.equal(all.total, 3);
    assert.equal(all.items[0].customerName, "Rita Shrestha");
    assert.equal(all.items[0].categoryLabel === "Court or facilities" || all.items[0].categoryLabel === "Staff behaviour", true);
    const by = (qs: string) => api.get(`/complaints?${qs}`, fd.auth).then((r) => r.body.data);
    assert.equal((await by("status=open")).total, 1);
    assert.equal((await by("category=staff")).total, 1);
    assert.equal((await by("q=rude")).total, 1);
    assert.equal((await by("q=rita")).total, 3, "search by the customer's name");
    assert.equal((await by("q=9860000001")).total, 3, "search by phone");
    assert.equal((await by("q=cp-aaaaa3")).items[0].code, "CP-AAAAA3");
    assert.deepEqual((await api.get("/complaints/counts", fd.auth)).body.data, { all: 3, open: 1, in_review: 1, resolved: 1, closed: 0 });
    const one = (await api.get("/complaints/CP-AAAAA2", fd.auth)).body.data;
    assert.equal(one.customerComplaints, 3);
    assert.equal((await api.get("/complaints/nope", fd.auth)).status, 404);
  });

  it("a reply or status change is saved, audited and tells the customer; no change tells nobody", async () => {
    await customer("9860000001", "Rita Shrestha");
    const fd = await staff("frontdesk");
    const c = await mk("CP-BBBBB1");
    const r = await api.patch(`/complaints/${c.id}`, fd.auth, { status: "resolved", reply: "We replaced the bulb. Thank you." });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, "resolved");
    assert.ok(r.body.data.resolvedAt);
    const row = await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(row.staffReply, "We replaced the bulb. Thank you.");
    assert.equal(row.repliedBy, fd.id);
    const notes = await prisma.notification.findMany({ where: { userId: "9860000001", type: "complaint" } });
    assert.equal(notes.length, 1);
    assert.match(notes[0].title, /CP-BBBBB1/);
    assert.equal(notes[0].href, "/complaints");
    assert.equal(await prisma.adminAuditLog.count({ where: { entity: "complaint", entityId: c.id } }), 1);

    // saving the same thing again changes nothing and sends nothing
    await api.patch(`/complaints/${c.id}`, fd.auth, { status: "resolved", reply: "We replaced the bulb. Thank you." });
    assert.equal(await prisma.notification.count({ where: { userId: "9860000001", type: "complaint" } }), 1);

    // reopening clears the resolved time
    const re = await api.patch(`/complaints/${c.id}`, fd.auth, { status: "in_review" });
    assert.equal(re.body.data.status, "in_review");
    assert.equal(re.body.data.resolvedAt, null);
  });

  it("checks input and permissions", async () => {
    await customer("9860000001", "Rita Shrestha");
    const fd = await staff("frontdesk");
    const acc = await staff("accountant");
    const c = await mk("CP-CCCCC1");
    assert.equal((await api.patch(`/complaints/${c.id}`, fd.auth, { status: "bogus" })).status, 400);
    assert.equal((await api.patch(`/complaints/${c.id}`, fd.auth, {})).status, 400);
    assert.equal((await api.patch(`/complaints/${c.id}`, fd.auth, { reply: "x".repeat(1001) })).status, 400);
    assert.equal((await api.patch("/complaints/missing", fd.auth, { status: "closed" })).status, 404);
    assert.equal((await api.get("/complaints", acc.auth)).status, 403, "accountants do not handle complaints");
    assert.equal((await api.patch(`/complaints/${c.id}`, acc.auth, { status: "closed" })).status, 403);
  });
});
