import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { addDaysKey, api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const P = "9870001111";
const today = todayKey();

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}
const game = (code: string, over: Record<string, unknown> = {}) =>
  prisma.booking.create({ data: { userId: P, date: today, startTime: "10:00", endTime: "11:00", duration: 1, customerName: "Bill Payer", basePrice: 1250, subtotal: 1250, totalPrice: 1250, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code, ...over } });
async function shop() {
  const mgr = await staff("admin");
  const cat = (await api.post("/inventory/categories", mgr.auth, { name: "Drinks" })).body.data;
  const water = (await api.post("/inventory/products", mgr.auth, { name: "Mineral water", price: 25, categoryId: cat.id, openingStock: 100 })).body.data;
  await customer(P, "Bill Payer");
  return { mgr, water };
}
const pts = async () => (await prisma.loyaltyEntry.findMany({ where: { userId: P } })).reduce((a, e) => a + Number(e.points), 0);

describe("Final bill: goods and games together", () => {
  it("shows the customer's games and what is still unpaid", async () => {
    const { mgr } = await shop();
    await game("UF-BILL01");
    await game("UF-BILL02", { paymentStatus: "completed", startTime: "08:00", endTime: "09:00" });
    await game("UF-BILL03", { status: "cancelled" });
    await game("UF-OLD001", { date: addDaysKey(today, -20) });
    const r = (await api.get(`/inventory/customer-bill?phone=${P}`, mgr.auth)).body.data;
    assert.equal(r.customer.name, "Bill Payer");
    assert.deepEqual(r.games.map((g: { code: string }) => g.code).sort(), ["UF-BILL01", "UF-BILL02"], "cancelled and old games are left out");
    assert.equal(r.games.find((g: { code: string }) => g.code === "UF-BILL01").paid, false);
    assert.equal((await api.get("/inventory/customer-bill?phone=9899999999", mgr.auth)).body.data.customer, null);
  });

  it("one bill: pays the game and the goods, stores it for the customer, and adds both kinds of points", async () => {
    const { mgr, water } = await shop();
    const g = await game("UF-BILL01");
    const r = await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash", bookingIds: [g.id], items: [{ productId: water.id, quantity: 8 }] });
    assert.equal(r.status, 201);
    assert.match(r.body.data.code, /^CB-[A-Z2-9]{6}$/);
    assert.deepEqual([r.body.data.gameTotal, r.body.data.goodsTotal, r.body.data.total], [1250, 200, 1450]);
    assert.deepEqual(r.body.data.lines.map((l: { type: string }) => l.type), ["game", "goods"]);
    assert.deepEqual([r.body.data.pointsGames, r.body.data.pointsGoods], [12.5, 2]);
    const b = await prisma.booking.findUnique({ where: { id: g.id } });
    assert.deepEqual([b!.paymentStatus, b!.cashAmount, b!.remainingAmount], ["completed", 1250, 0]);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 92);
    assert.equal(await pts(), 14.5);
    const bill = await prisma.checkout.findUnique({ where: { code: r.body.data.code } });
    assert.equal(bill!.userId, P);
    assert.deepEqual(bill!.bookingIds, [g.id]);
    assert.equal(Number(bill!.pointsGames), 12.5);
    assert.ok(await prisma.notification.findFirst({ where: { userId: P, type: "payment", title: { contains: r.body.data.code } } }));
    const list = (await api.get("/inventory/bills", mgr.auth)).body.data;
    assert.equal(list.total, 1);
    assert.equal(list.items[0].customerName, "Bill Payer");
  });

  it("never charges a game twice or takes another customer's game, and nothing changes when it fails", async () => {
    const { mgr, water } = await shop();
    const g = await game("UF-BILL01");
    await customer("9870002222", "Someone Else");
    const theirs = await prisma.booking.create({ data: { userId: "9870002222", date: today, startTime: "12:00", endTime: "13:00", duration: 1, customerName: "x", basePrice: 900, subtotal: 900, totalPrice: 900, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-THEIRS" } });
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash", bookingIds: [theirs.id] })).status, 404);
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash", bookingIds: [g.id] })).status, 201);
    const again = await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash", bookingIds: [g.id], items: [{ productId: water.id, quantity: 5 }] });
    assert.equal(again.status, 409);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 100, "goods were not taken");
    assert.equal(await prisma.checkout.count(), 1);
    assert.equal(await pts(), 12.5, "points once");
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash" })).status, 400);
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: "9899999999", payment: "cash", items: [{ productId: water.id, quantity: 1 }] })).status, 404);
  });

  it("a game still to be played is paid now and earns its points when it is completed", async () => {
    const { mgr } = await shop();
    const g = await game("UF-BILL01", { status: "confirmed" });
    const r = await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "online", bookingIds: [g.id] });
    assert.equal(r.body.data.pointsGames, 0);
    assert.equal(r.body.data.gamesWaitingForPoints, 1);
    assert.equal((await prisma.booking.findUnique({ where: { id: g.id } }))!.onlineAmount, 1250);
    assert.equal(await pts(), 0);
    const done = await api.post(`/bookings/${g.id}/complete`, mgr.auth);
    assert.equal(done.status, 200);
    assert.equal(await pts(), 12.5);
  });

  it("goods only still make a bill for the customer; collecting a game needs the payments tick too", async () => {
    const { mgr, water } = await shop();
    const only = await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "cash", items: [{ productId: water.id, quantity: 4 }] });
    assert.equal(only.status, 201);
    assert.equal(only.body.data.gameTotal, 0);
    const g = await game("UF-BILL01");
    const sellOnly = await staffWith(["inventory.sell"], "s@test.np");
    assert.equal((await api.post("/inventory/checkout", sellOnly.auth, { phone: P, payment: "cash", bookingIds: [g.id] })).status, 403);
    assert.equal((await api.post("/inventory/checkout", sellOnly.auth, { phone: P, payment: "cash", items: [{ productId: water.id, quantity: 1 }] })).status, 201);
    const both = await staffWith(["inventory.sell", "payments.collect"], "b@test.np");
    assert.equal((await api.post("/inventory/checkout", both.auth, { phone: P, payment: "cash", bookingIds: [g.id] })).status, 201);
    assert.equal((await api.get(`/inventory/customer-bill?phone=${P}`, (await staffWith([], "n@test.np")).auth)).status, 403);
  });
});

describe("Bulk booking", () => {
  const dates = (n: number, from = 1) => Array.from({ length: n }, (_, i) => addDaysKey(today, from + i * 7));
  const base = { startTime: "07:00", duration: 1, customerName: "Weekly Team", customerPhone: P };

  it("previews every date as free or taken, with the price, and changes nothing", async () => {
    const { mgr } = await shop();
    const d = dates(4);
    await api.post("/bookings/walk-in", mgr.auth, { date: d[1], startTime: "07:00", customerName: "Someone" });
    const r = await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: d, dryRun: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.plan.map((p: { free: boolean }) => p.free), [true, false, true, true]);
    assert.deepEqual([r.body.data.free, r.body.data.taken], [3, 1]);
    assert.equal(await prisma.booking.count(), 1);
  });

  it("books all the free dates in one go, skipping the taken ones, with a shared code in the notes", async () => {
    const { mgr } = await shop();
    const d = dates(4);
    await api.post("/bookings/walk-in", mgr.auth, { date: d[1], startTime: "07:00", customerName: "Someone" });
    const r = await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: d, priceOverride: 1000, paid: true, paymentMethod: "venue" });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.created.length, 3);
    assert.deepEqual(r.body.data.skipped, [d[1]]);
    const rows = await prisma.booking.findMany({ where: { customerName: "Weekly Team" }, orderBy: { date: "asc" } });
    assert.deepEqual(rows.map((x) => x.totalPrice), [1000, 1000, 1000]);
    assert.ok(rows.every((x) => x.userId === P && x.paymentStatus === "completed" && /BULK UF-/.test(x.notes ?? "")));
    assert.equal(await prisma.bookingSlot.count(), 4, "one hour each, plus the earlier booking");
    assert.equal((await prisma.adminAuditLog.count({ where: { action: "walk-in-bulk" } })), 1);
  });

  it("'all' mode books everything or nothing, and a second try finds the dates taken", async () => {
    const { mgr } = await shop();
    const d = dates(3);
    await api.post("/bookings/walk-in", mgr.auth, { date: d[2], startTime: "07:00", customerName: "Someone" });
    const none = await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: d, mode: "all" });
    assert.equal(none.status, 409);
    assert.match(none.body.message, new RegExp(d[2]));
    assert.equal(await prisma.booking.count(), 1, "nothing was booked");
    assert.equal((await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: [d[0], d[1]], mode: "all" })).status, 201);
    assert.equal((await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: [d[0], d[1]] })).status, 409, "all taken now");
  });

  it("multi-hour games, validation, blocked hours and permission", async () => {
    const { mgr } = await shop();
    const d = dates(2);
    const two = await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: d, duration: 2, startTime: "17:00" });
    assert.equal(two.status, 201);
    assert.equal(await prisma.bookingSlot.count(), 4);
    assert.equal(two.body.data.created[0].endTime, "19:00");
    await api.post("/courts/blocks", mgr.auth, { date: addDaysKey(today, 3), hours: [9], reason: "Maintenance" });
    const blocked = await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: [addDaysKey(today, 3)], startTime: "09:00", dryRun: true });
    assert.equal(blocked.body.data.taken, 1, "a blocked hour counts as taken");
    for (const bad of [{ dates: [] }, { dates: Array.from({ length: 32 }, (_, i) => addDaysKey(today, i)) }, { dates: [addDaysKey(today, 90)] }, { dates: ["2026-13-45"] }, { customerName: "x" }, { startTime: "23:00", duration: 2 }]) {
      assert.equal((await api.post("/bookings/walk-in/bulk", mgr.auth, { ...base, dates: d, ...bad })).status, 400, JSON.stringify(bad).slice(0, 60));
    }
    const noPerm = await staffWith(["bookings.view"], "v@test.np");
    assert.equal((await api.post("/bookings/walk-in/bulk", noPerm.auth, { ...base, dates: d })).status, 403);
  });
});
