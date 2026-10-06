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

describe("Dues: everything one customer still owes", () => {
  const mk = (code: string, date: string, over: Record<string, unknown> = {}) =>
    prisma.booking.create({ data: { userId: P, date, startTime: "18:00", endTime: "19:00", duration: 1, customerName: "Bill Payer", customerPhone: P, basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code, ...over } });

  it("lists old unpaid games, today's, and upcoming ones separately, and leaves out what is paid, cancelled or waiting for a QR", async () => {
    const { mgr } = await shop();
    const cur = await mk("UF-DUE000", today);
    await mk("UF-DUE001", addDaysKey(today, -9));
    await mk("UF-DUE002", addDaysKey(today, -2), { totalPrice: 1500 });
    await mk("UF-PAID01", addDaysKey(today, -3), { paymentStatus: "completed" });
    await mk("UF-CANC01", addDaysKey(today, -4), { status: "cancelled" });
    await mk("UF-QR0001", addDaysKey(today, -1), { status: "pending", paymentMethod: "esewa" });
    await mk("UF-UP0001", addDaysKey(today, 3), { status: "confirmed" });
    await mk("UF-UP0002", addDaysKey(today, 6), { status: "confirmed" });
    const r = (await api.get(`/bookings/${cur.id}/dues`, mgr.auth)).body.data;
    assert.equal(r.customer.registered, true);
    assert.deepEqual(r.past.map((x: { code: string }) => x.code), ["UF-DUE001", "UF-DUE002"]);
    assert.equal(r.pastTotal, 2500);
    assert.deepEqual(r.upcoming.map((x: { code: string }) => x.code), ["UF-UP0001", "UF-UP0002"]);
    assert.equal(r.current.owed, true);
  });

  it("a guest with a phone number is matched by that number; no number means only this booking", async () => {
    const { mgr } = await shop();
    const g1 = await prisma.booking.create({ data: { userId: null, customerPhone: "9877000001", customerName: "Guest", date: today, startTime: "09:00", endTime: "10:00", duration: 1, basePrice: 800, subtotal: 800, totalPrice: 800, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-GST001" } });
    await prisma.booking.create({ data: { userId: null, customerPhone: "9877000001", customerName: "Guest", date: addDaysKey(today, -5), startTime: "09:00", endTime: "10:00", duration: 1, basePrice: 800, subtotal: 800, totalPrice: 800, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-GST002" } });
    const r = (await api.get(`/bookings/${g1.id}/dues`, mgr.auth)).body.data;
    assert.equal(r.customer.registered, false);
    assert.equal(r.past.length, 1);
    const none = await prisma.booking.create({ data: { userId: null, customerPhone: null, customerName: "test", date: today, startTime: "11:00", endTime: "12:00", duration: 1, basePrice: 500, subtotal: 500, totalPrice: 500, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-NOPH01" } });
    const n = (await api.get(`/bookings/${none.id}/dues`, mgr.auth)).body.data;
    assert.equal(n.customer.known, false);
    assert.deepEqual([n.past.length, n.upcoming.length], [0, 0]);
  });

  it("collects this booking, the old dues and a chosen upcoming one in one payment, with one bill and the points", async () => {
    const { mgr } = await shop();
    const cur = await mk("UF-DUE000", today);
    const old = await mk("UF-DUE001", addDaysKey(today, -9));
    const up = await mk("UF-UP0001", addDaysKey(today, 3), { status: "confirmed" });
    const skipped = await mk("UF-UP0002", addDaysKey(today, 6), { status: "confirmed" });
    const r = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: cur.id, bookingIds: [cur.id, old.id, up.id], method: "venue" });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.count, r.body.data.total], [3, 3000]);
    assert.match(r.body.data.billCode, /^CB-/);
    for (const x of [cur, old, up]) assert.equal((await prisma.booking.findUnique({ where: { id: x.id } }))!.paymentStatus, "completed");
    assert.equal((await prisma.booking.findUnique({ where: { id: skipped.id } }))!.paymentStatus, "pending", "the skipped one stays unpaid");
    const bill = await prisma.checkout.findFirst({ where: { userId: P } });
    assert.deepEqual([bill!.total, bill!.bookingIds.length], [3000, 3]);
    assert.equal(await pts(), 20, "the two played games earn 10 each; the upcoming one earns when it is played");
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: cur.id, bookingIds: [old.id] })).status, 409, "never twice");
  });

  it("refuses another customer's booking, needs the collect permission, and works for a guest without a bill", async () => {
    const { mgr } = await shop();
    const cur = await mk("UF-DUE000", today);
    await customer("9870003333", "Other");
    const theirs = await prisma.booking.create({ data: { userId: "9870003333", customerPhone: "9870003333", date: today, startTime: "13:00", endTime: "14:00", duration: 1, customerName: "Other", basePrice: 900, subtotal: 900, totalPrice: 900, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-OTHER1" } });
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: cur.id, bookingIds: [cur.id, theirs.id] })).status, 400);
    const viewer = await staffWith(["bookings.view"], "v@test.np");
    assert.equal((await api.post("/bookings/collect-dues", viewer.auth, { anchorId: cur.id, bookingIds: [cur.id] })).status, 403);
    assert.equal((await api.get(`/bookings/${cur.id}/dues`, viewer.auth)).status, 200);
    const g = await prisma.booking.create({ data: { userId: null, customerPhone: "9877000009", customerName: "Guest", date: today, startTime: "15:00", endTime: "16:00", duration: 1, basePrice: 700, subtotal: 700, totalPrice: 700, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code: "UF-GST009" } });
    const r = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], method: "esewa" });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.billCode, null);
    assert.equal((await prisma.booking.findUnique({ where: { id: g.id } }))!.onlineAmount, 700);
  });
});

describe("Split payment and goods on credit", () => {
  const mkGame = (code: string, date: string, over: Record<string, unknown> = {}) =>
    prisma.booking.create({ data: { userId: P, date, startTime: "18:00", endTime: "19:00", duration: 1, customerName: "Bill Payer", customerPhone: P, basePrice: 1000, subtotal: 1000, totalPrice: 1000, paymentMethod: "venue", status: "completed", paymentStatus: "pending", code, ...over } });

  it("pays one bill with cash and eSewa together, and the booking records how much was each", async () => {
    const { mgr, water } = await shop();
    const g = await mkGame("UF-SPL001", today);
    const r = await api.post("/inventory/checkout", mgr.auth, { phone: P, bookingIds: [g.id], items: [{ productId: water.id, quantity: 20 }], payments: [{ method: "cash", amount: 1200 }, { method: "esewa", amount: 300 }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.total, 1500);
    const b = await prisma.booking.findUnique({ where: { id: g.id } });
    assert.deepEqual([b!.cashAmount, b!.onlineAmount, b!.paymentMethod], [1000, 0, "venue"], "the game was fully covered by cash");
    const log = await prisma.inventoryLog.findFirst({ where: { reason: { startsWith: "Goods Sale" } } });
    assert.deepEqual([log!.cashAmount, log!.onlineAmount], [200, 300], "the goods took the rest of the cash and the eSewa part");
    const bill = await prisma.checkout.findFirst({ where: { userId: P } });
    assert.equal(bill!.paymentMethod, "split");
  });

  it("refuses payments that do not add up to the total, and nothing changes", async () => {
    const { mgr, water } = await shop();
    const g = await mkGame("UF-SPL002", today);
    const bad = await api.post("/inventory/checkout", mgr.auth, { phone: P, bookingIds: [g.id], items: [{ productId: water.id, quantity: 4 }], payments: [{ method: "cash", amount: 500 }, { method: "fonepay", amount: 500 }] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /add up to Rs. 1000, but the total is Rs. 1100/);
    assert.equal((await prisma.booking.findUnique({ where: { id: g.id } }))!.paymentStatus, "pending");
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 100);
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, bookingIds: [g.id] })).status, 400, "no payment chosen");
  });

  it("goods on credit: stock goes now, no points yet, shown in the customer's dues, not counted as sales", async () => {
    const { mgr, water } = await shop();
    const r = await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "due", items: [{ productId: water.id, quantity: 40 }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.due, true);
    assert.equal(r.body.data.total, 1000);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 60);
    assert.equal(await pts(), 0);
    assert.equal(await prisma.checkout.count(), 0, "no bill until it is paid");
    const ov = (await api.get("/inventory/overview", mgr.auth)).body.data;
    assert.deepEqual([ov.goodsDue.amount, ov.goodsDue.count, ov.salesToday.amount], [1000, 1, 0]);
    const g = await mkGame("UF-CRD001", today);
    const dues = (await api.get(`/bookings/${g.id}/dues`, mgr.auth)).body.data;
    assert.deepEqual([dues.goods.length, dues.goodsTotal], [1, 1000]);
    assert.match(dues.goods[0].items, /40 x Mineral water/);
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "due", items: [] })).status, 400);
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "due", items: [{ productId: water.id, quantity: 1 }], bookingIds: [g.id] })).status, 400, "pay later is for goods only");
    assert.equal((await api.post("/inventory/checkout", mgr.auth, { phone: "9899999999", payment: "due", items: [{ productId: water.id, quantity: 1 }] })).status, 404, "credit needs an account");
  });

  it("the game and the goods on credit are collected together in a split payment, with the points", async () => {
    const { mgr, water } = await shop();
    await api.post("/inventory/checkout", mgr.auth, { phone: P, payment: "due", items: [{ productId: water.id, quantity: 40 }] });
    const g = await mkGame("UF-CRD002", today, { totalPrice: 1250 });
    const up = await mkGame("UF-CRD003", addDaysKey(today, 3), { status: "confirmed", totalPrice: 1350 });
    const dues = (await api.get(`/bookings/${g.id}/dues`, mgr.auth)).body.data;
    const r = await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id, up.id], goodsDueIds: dues.goods.map((x: { id: string }) => x.id), payments: [{ method: "cash", amount: 2000 }, { method: "fonepay", amount: 1600 }] });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.count, r.body.data.total], [3, 3600]);
    assert.equal(await pts(), 22.5, "goods 10 + the played game 12.5; the upcoming game earns when played");
    const bill = await prisma.checkout.findFirst({ where: { userId: P } });
    assert.deepEqual([bill!.total, bill!.goodsTotal, bill!.gameTotal, bill!.paymentMethod], [3600, 1000, 2600, "split"]);
    assert.equal((await prisma.goodsDue.findFirst({ where: { userId: P } }))!.status, "paid");
    const up2 = await prisma.booking.findUnique({ where: { id: up.id } });
    assert.equal(up2!.cashAmount + up2!.onlineAmount, 1350, "the upcoming game was fully covered by the split");
    const ov = (await api.get("/inventory/overview", mgr.auth)).body.data;
    assert.equal(ov.goodsDue.amount, 0);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [], goodsDueIds: dues.goods.map((x: { id: string }) => x.id), method: "venue" })).status, 409, "never paid twice");
  });

  it("goods dues of another customer cannot be taken, and collecting needs the right permissions", async () => {
    const { mgr, water } = await shop();
    await customer("9870004444", "Other");
    await api.post("/inventory/checkout", mgr.auth, { phone: "9870004444", payment: "due", items: [{ productId: water.id, quantity: 2 }] });
    const theirs = await prisma.goodsDue.findFirst({ where: { userId: "9870004444" } });
    const g = await mkGame("UF-CRD004", today);
    assert.equal((await api.post("/bookings/collect-dues", mgr.auth, { anchorId: g.id, bookingIds: [g.id], goodsDueIds: [theirs!.id], method: "venue" })).status, 400);
    const sellOnly = await staffWith(["inventory.sell"], "so@test.np");
    assert.equal((await api.post("/inventory/checkout", sellOnly.auth, { phone: P, payment: "due", items: [{ productId: water.id, quantity: 1 }] })).status, 201, "giving goods on credit needs only the sell tick");
    const due = await prisma.goodsDue.findFirst({ where: { userId: P } });
    assert.equal((await api.post("/inventory/checkout", sellOnly.auth, { phone: P, payment: "cash", goodsDueIds: [due!.id] })).status, 403);
  });
});
