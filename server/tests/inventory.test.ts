import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, customer, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

async function setup() {
  const mgr = await staff("admin");
  const cat = (await api.post("/inventory/categories", mgr.auth, { name: "Drinks" })).body.data;
  const water = (await api.post("/inventory/products", mgr.auth, { name: "Mineral water", price: 40, costPrice: 25, categoryId: cat.id, openingStock: 20, lowStockThreshold: 5 })).body.data;
  const juice = (await api.post("/inventory/products", mgr.auth, { name: "Juice", price: 100, costPrice: 60, categoryId: cat.id, openingStock: 3, lowStockThreshold: 5, unit: "bottle" })).body.data;
  return { mgr, cat, water, juice };
}

describe("Inventory: categories and products", () => {
  it("adds categories and products, with opening stock logged and the margin worked out", async () => {
    const { mgr, cat, water, juice } = await setup();
    assert.equal(water.stock, 20);
    assert.equal(water.margin, 38);
    assert.equal(juice.state, "low");
    assert.equal(water.state, "ok");
    const logs = (await api.get("/inventory/logs", mgr.auth)).body.data;
    assert.equal(logs.total, 2);
    assert.equal(logs.items[0].reason, "Opening stock");
    assert.equal((await api.post("/inventory/categories", mgr.auth, { name: "drinks" })).status, 409, "same name, any case");
    assert.equal((await api.post("/inventory/products", mgr.auth, { name: "Mineral Water", price: 40, categoryId: cat.id })).status, 409);
    assert.equal((await api.post("/inventory/products", mgr.auth, { name: "Free", price: 0, categoryId: cat.id })).status, 400);
    assert.equal((await api.post("/inventory/products", mgr.auth, { name: "Ghost", price: 5, categoryId: "nope" })).status, 404);
    const cats = (await api.get("/inventory/categories", mgr.auth)).body.data;
    assert.equal(cats[0].products, 2);
    assert.equal((await api.del(`/inventory/categories/${cat.id}`, mgr.auth)).status, 409, "has products");
  });

  it("edits, filters and deletes", async () => {
    const { mgr, water } = await setup();
    assert.equal((await api.patch(`/inventory/products/${water.id}`, mgr.auth, { price: 50, lowStockThreshold: 25 })).body.data.state, "low", "20 left, warn at 25");
    assert.equal((await api.get("/inventory/products?stock=low", mgr.auth)).body.data.length, 2);
    assert.equal((await api.get("/inventory/products?q=juice", mgr.auth)).body.data.length, 1);
    assert.equal((await api.get("/inventory/products?stock=out", mgr.auth)).body.data.length, 0);
    const ov = (await api.get("/inventory/overview", mgr.auth)).body.data;
    assert.deepEqual([ov.products, ov.lowStock, ov.outOfStock], [2, 2, 0]);
    assert.equal(ov.stockCostValue, 20 * 25 + 3 * 60);
    assert.equal((await api.del(`/inventory/products/${water.id}`, mgr.auth)).status, 200);
    assert.equal((await api.del(`/inventory/products/${water.id}`, mgr.auth)).status, 404);
  });
});

describe("Inventory: stock changes", () => {
  it("restocks, removes and counts, each leaving a log, and never goes below zero", async () => {
    const { mgr, water } = await setup();
    const add = await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "add", quantity: 10, costPrice: 27 });
    assert.equal(add.body.data.stock, 30);
    assert.equal(add.body.data.costPrice, 27);
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "remove", quantity: 4, reason: "Broken crate" })).body.data.stock, 26);
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "set", quantity: 24 })).body.data.stock, 24);
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "set", quantity: 24 })).status, 409, "already that amount");
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "remove", quantity: 25 })).status, 409);
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, mgr.auth, { type: "add", quantity: 0 })).status, 400);
    const rows = await prisma.inventoryLog.findMany({ where: { productId: water.id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((r) => r.change), [20, 10, -4, -2]);
    assert.match(rows[2].reason!, /Broken crate/);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 24);
  });
});

describe("Inventory: selling goods", () => {
  it("sells at the product price, takes the stock, logs cash, and a walk-in earns no points", async () => {
    const { mgr, water, juice } = await setup();
    const r = await api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: water.id, quantity: 3 }, { productId: juice.id, quantity: 1 }, { productId: water.id, quantity: 2 }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.amount, 5 * 40 + 100, "price comes from the product; duplicate lines are merged");
    assert.equal(r.body.data.points, 0);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 15);
    assert.equal((await prisma.product.findUnique({ where: { id: juice.id } }))!.inventory, 2);
    const log = await prisma.inventoryLog.findFirst({ where: { productId: water.id, reason: { startsWith: "Goods Sale" } } });
    assert.deepEqual([log!.change, log!.cashAmount, log!.onlineAmount], [-5, 200, 0]);
    const sale = await prisma.goodsSale.findUnique({ where: { id: r.body.data.id } });
    assert.equal(sale!.userId, null);
    assert.match(sale!.items!, /5 x Mineral water/);
    assert.equal(await prisma.loyaltyEntry.count(), 0);
    const ov = (await api.get("/inventory/overview", mgr.auth)).body.data;
    assert.deepEqual([ov.salesToday.amount, ov.salesToday.count], [300, 1]);
    const list = (await api.get("/inventory/sales", mgr.auth)).body.data;
    assert.equal(list.items[0].soldBy, "admin person");
  });

  it("a registered customer earns Rs. 100 = 1 point, once, with a notice", async () => {
    const { mgr, water } = await setup();
    await customer("9860001111", "Goods Buyer");
    const r = await api.post("/inventory/sales", mgr.auth, { payment: "online", phone: "9860001111", items: [{ productId: water.id, quantity: 20 }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.amount, 800);
    assert.equal(r.body.data.points, 8);
    assert.equal(r.body.data.customerName, "Goods Buyer");
    const e = await prisma.loyaltyEntry.findFirst({ where: { userId: "9860001111" } });
    assert.equal(e!.kind, "goods");
    assert.equal(Number(e!.points), 8);
    assert.ok(await prisma.notification.findFirst({ where: { userId: "9860001111", type: "points" } }));
    assert.equal((await prisma.inventoryLog.findFirst({ where: { reason: { startsWith: "Goods Sale" } } }))!.onlineAmount, 800);
    assert.equal((await api.post("/inventory/sales", mgr.auth, { payment: "cash", phone: "9899999999", items: [{ productId: water.id, quantity: 1 }] })).status, 404, "unknown customer");
  });

  it("refuses when there is not enough, changes nothing, and two sales cannot take the last item", async () => {
    const { mgr, water, juice } = await setup();
    const short = await api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: water.id, quantity: 2 }, { productId: juice.id, quantity: 4 }] });
    assert.equal(short.status, 409);
    assert.match(short.body.message, /Only 3 Juice/);
    assert.equal((await prisma.product.findUnique({ where: { id: water.id } }))!.inventory, 20, "nothing was taken");
    assert.equal(await prisma.goodsSale.count(), 0);
    const both = await Promise.all([
      api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: juice.id, quantity: 2 }] }),
      api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: juice.id, quantity: 2 }] }),
    ]);
    assert.deepEqual(both.map((x) => x.status).sort(), [201, 409]);
    assert.equal((await prisma.product.findUnique({ where: { id: juice.id } }))!.inventory, 1);
    assert.equal((await api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [] })).status, 400);
    assert.equal((await api.post("/inventory/sales", mgr.auth, { payment: "cash", items: [{ productId: "gone", quantity: 1 }] })).status, 404);
    assert.equal((await api.post("/inventory/sales", mgr.auth, { payment: "card", items: [{ productId: juice.id, quantity: 1 }] })).status, 400);
  });
});

describe("Inventory: who may do what", () => {
  it("view, products, stock and selling are separate ticks; front desk can sell", async () => {
    const owner = await staff("owner");
    const cat = (await api.get("/staff/catalog", owner.auth)).body.data;
    for (const k of ["inventory.view", "inventory.products", "inventory.stock", "inventory.sell"]) assert.ok(cat.assignable.includes(k), k);
    assert.ok(cat.presets.find((p: { id: string }) => p.id === "frontdesk").permissions.includes("inventory.sell"));
    const { water } = await setup();
    const v = await staffWith(["inventory.view"], "v@test.np");
    assert.equal((await api.get("/inventory/products", v.auth)).status, 200);
    assert.equal((await api.post(`/inventory/products/${water.id}/stock`, v.auth, { type: "add", quantity: 1 })).status, 403);
    assert.equal((await api.post("/inventory/sales", v.auth, { payment: "cash", items: [{ productId: water.id, quantity: 1 }] })).status, 403);
    assert.equal((await api.patch(`/inventory/products/${water.id}`, v.auth, { price: 1 })).status, 403);
    assert.equal((await api.get("/inventory/products", (await staffWith([], "n@test.np")).auth)).status, 403);
    const s = await staffWith(["inventory.sell", "inventory.view"], "s@test.np");
    assert.equal((await api.post("/inventory/sales", s.auth, { payment: "cash", items: [{ productId: water.id, quantity: 1 }] })).status, 201);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "inventory_sale" } })) >= 1);
  });
});
