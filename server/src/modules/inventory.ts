// Inventory & Goods, staff side. Uses the venue's existing Product, Category and InventoryLog tables (the customer backend already
// takes water from stock when a booking is paid), plus GoodsSale for goods sold over the counter.
// Every stock change is one row in InventoryLog, made under a row lock so two staff can never sell the last item twice.
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { awardPoints, notify, pointsForGame, pointsForGoods } from "../lib/customer-effects";
import { DEAD, Tx, creditGoods, lockProducts, paysSchema, sellGoods, settle } from "../lib/settle";
import { addDaysKey, todayKey } from "../lib/dates";
import { AppError, handler, page, param, parse, send } from "../lib/http";
import { requirePermission } from "../middleware/auth";

export const inventoryRouter = Router();

const phone = z.string().regex(/^9\d{9}$/, "Enter a 10-digit mobile number starting with 9");
const money = z.number().min(0).max(10_000_000);
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";

// Nepal day boundaries as instants, for "sales today"
const dayStart = (key: string) => new Date(`${key}T00:00:00+05:45`);

// ---------- overview ----------
inventoryRouter.get("/overview", requirePermission("inventory.view"), handler(async (_req, res) => {
  const products = await prisma.product.findMany({ select: { inventory: true, lowStockThreshold: true, price: true, costPrice: true } });
  const today = todayKey();
  const [t, w, dueToday, dueWeek, dues] = await Promise.all([
    prisma.goodsSale.aggregate({ where: { soldAt: { gte: dayStart(today) } }, _sum: { amount: true }, _count: true }),
    prisma.goodsSale.aggregate({ where: { soldAt: { gte: dayStart(addDaysKey(today, -6)) } }, _sum: { amount: true }, _count: true }),
    prisma.goodsDue.aggregate({ where: { status: "due", createdAt: { gte: dayStart(today) } }, _sum: { amount: true }, _count: true }),
    prisma.goodsDue.aggregate({ where: { status: "due", createdAt: { gte: dayStart(addDaysKey(today, -6)) } }, _sum: { amount: true }, _count: true }),
    prisma.goodsDue.aggregate({ where: { status: "due" }, _sum: { amount: true }, _count: true }),
  ]);
  send(res, {
    products: products.length,
    outOfStock: products.filter((p) => p.inventory <= 0).length,
    lowStock: products.filter((p) => p.inventory > 0 && p.inventory <= p.lowStockThreshold).length,
    stockCostValue: Math.round(products.reduce((s, p) => s + p.inventory * (p.costPrice ?? 0), 0)),
    stockRetailValue: Math.round(products.reduce((s, p) => s + p.inventory * p.price, 0)),
    // goods given on credit are not money yet, so they are left out of sales until they are paid
    salesToday: { amount: (t._sum.amount ?? 0) - (dueToday._sum.amount ?? 0), count: t._count - dueToday._count },
    salesWeek: { amount: (w._sum.amount ?? 0) - (dueWeek._sum.amount ?? 0), count: w._count - dueWeek._count },
    goodsDue: { amount: dues._sum.amount ?? 0, count: dues._count },
  });
}));

// ---------- categories ----------
inventoryRouter.get("/categories", requirePermission("inventory.view"), handler(async (_req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  send(res, cats.map((c) => ({ id: c.id, name: c.name, products: c._count.products })));
}));

inventoryRouter.post("/categories", requirePermission("inventory.products"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2, "Name is too short").max(40) }), req.body);
  const slug = slugify(b.name);
  if (await prisma.category.findFirst({ where: { OR: [{ name: { equals: b.name, mode: "insensitive" } }, { slug }] } })) throw new AppError(409, "A category with this name already exists");
  const c = await prisma.category.create({ data: { name: b.name, slug } });
  await audit(req, "create", "inventory_category", c.id, { name: b.name });
  send(res, { id: c.id, name: c.name, products: 0 }, "Category added", 201);
}));

inventoryRouter.patch("/categories/:id", requirePermission("inventory.products"), handler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(40) }), req.body);
  const c = await prisma.category.findUnique({ where: { id: param(req, "id") } });
  if (!c) throw new AppError(404, "Category not found");
  const slug = slugify(b.name);
  if (await prisma.category.findFirst({ where: { id: { not: c.id }, OR: [{ name: { equals: b.name, mode: "insensitive" } }, { slug }] } })) throw new AppError(409, "A category with this name already exists");
  await prisma.category.update({ where: { id: c.id }, data: { name: b.name, slug } });
  await audit(req, "update", "inventory_category", c.id, { name: b.name });
  send(res, null, "Saved");
}));

inventoryRouter.delete("/categories/:id", requirePermission("inventory.products"), handler(async (req, res) => {
  const c = await prisma.category.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { products: true } } } });
  if (!c) throw new AppError(404, "Category not found");
  if (c._count.products > 0) throw new AppError(409, `${c._count.products} product${c._count.products === 1 ? " is" : "s are"} in this category. Move or delete them first.`);
  await prisma.category.delete({ where: { id: c.id } });
  await audit(req, "delete", "inventory_category", c.id, { name: c.name });
  send(res, null, "Category deleted");
}));

// ---------- products ----------
type P = Prisma.ProductGetPayload<{ include: { category: { select: { id: true; name: true } } } }>;
const productView = (p: P) => ({
  id: p.id, name: p.name, description: p.description, price: p.price, costPrice: p.costPrice, unit: p.unit, stock: p.inventory, lowStockThreshold: p.lowStockThreshold,
  categoryId: p.categoryId, category: p.category.name, state: p.inventory <= 0 ? "out" : p.inventory <= p.lowStockThreshold ? "low" : "ok",
  margin: p.costPrice && p.price > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null,
});
const withCat = { category: { select: { id: true, name: true } } } as const;

inventoryRouter.get("/products", requirePermission("inventory.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const text = q.q?.trim().slice(0, 60);
  const rows = await prisma.product.findMany({
    where: { ...(q.category ? { categoryId: q.category } : {}), ...(text ? { name: { contains: text, mode: "insensitive" } } : {}) },
    include: withCat, orderBy: { name: "asc" }, take: 500,
  });
  let items = rows.map(productView);
  if (q.stock === "low") items = items.filter((p) => p.state !== "ok");
  if (q.stock === "out") items = items.filter((p) => p.state === "out");
  send(res, items);
}));

const productFields = {
  name: z.string().trim().min(2, "Name is too short").max(60),
  description: z.string().trim().max(200).nullable().optional(),
  price: money.refine((n) => n > 0, "Price must be more than 0"),
  costPrice: money.nullable().optional(),
  unit: z.string().trim().min(1).max(12),
  lowStockThreshold: z.number().int().min(0).max(100000),
  categoryId: z.string().min(1, "Choose a category"),
};

inventoryRouter.post("/products", requirePermission("inventory.products"), handler(async (req, res) => {
  const b = parse(z.object({ ...productFields, unit: productFields.unit.default("pcs"), lowStockThreshold: productFields.lowStockThreshold.default(10), openingStock: z.number().int().min(0).max(1_000_000).default(0) }), req.body);
  if (!(await prisma.category.findUnique({ where: { id: b.categoryId } }))) throw new AppError(404, "Category not found");
  if (await prisma.product.findFirst({ where: { name: { equals: b.name, mode: "insensitive" }, categoryId: b.categoryId } })) throw new AppError(409, "This product already exists in that category");
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { name: b.name, description: b.description || null, price: b.price, costPrice: b.costPrice ?? null, unit: b.unit, lowStockThreshold: b.lowStockThreshold, categoryId: b.categoryId, inventory: b.openingStock }, include: withCat });
    if (b.openingStock > 0) await tx.inventoryLog.create({ data: { productId: created.id, change: b.openingStock, price: b.costPrice ?? null, reason: "Opening stock" } });
    return created;
  });
  await audit(req, "create", "inventory_product", p.id, { name: p.name, price: p.price, openingStock: b.openingStock });
  send(res, productView(p), "Product added", 201);
}));

inventoryRouter.patch("/products/:id", requirePermission("inventory.products"), handler(async (req, res) => {
  const b = parse(z.object(productFields).partial(), req.body);
  const p = await prisma.product.findUnique({ where: { id: param(req, "id") } });
  if (!p) throw new AppError(404, "Product not found");
  if (b.categoryId && !(await prisma.category.findUnique({ where: { id: b.categoryId } }))) throw new AppError(404, "Category not found");
  const upd = await prisma.product.update({ where: { id: p.id }, data: { ...b, ...(b.description !== undefined ? { description: b.description || null } : {}) }, include: withCat });
  await audit(req, "update", "inventory_product", p.id, { name: p.name, ...b });
  send(res, productView(upd), "Saved");
}));

inventoryRouter.delete("/products/:id", requirePermission("inventory.products"), handler(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { orderItems: true } } } });
  if (!p) throw new AppError(404, "Product not found");
  if (p._count.orderItems > 0) throw new AppError(409, "This product is part of past orders, so it cannot be deleted. Set its stock to 0 instead.");
  await prisma.product.delete({ where: { id: p.id } });
  await audit(req, "delete", "inventory_product", p.id, { name: p.name, stock: p.inventory });
  send(res, null, "Product deleted");
}));

// ---------- stock ----------
// add = restock, remove = damaged, lost or used, set = the counted amount on the shelf
inventoryRouter.post("/products/:id/stock", requirePermission("inventory.stock"), handler(async (req, res) => {
  const b = parse(z.object({
    type: z.enum(["add", "remove", "set"]), quantity: z.number().int().min(0).max(1_000_000), reason: z.string().trim().max(120).optional(), costPrice: money.optional(),
  }), req.body);
  if (b.type !== "set" && b.quantity < 1) throw new AppError(400, "Enter a quantity of at least 1");
  const id = param(req, "id");
  const out = await prisma.$transaction(async (tx) => {
    await lockProducts(tx, [id]);
    const p = await tx.product.findUnique({ where: { id } });
    if (!p) throw new AppError(404, "Product not found");
    const delta = b.type === "add" ? b.quantity : b.type === "remove" ? -b.quantity : b.quantity - p.inventory;
    if (delta === 0) throw new AppError(409, "The stock is already that amount");
    if (p.inventory + delta < 0) throw new AppError(409, `Only ${p.inventory} in stock, so you cannot remove ${-delta}`);
    const reason = b.reason || (b.type === "add" ? "Restock" : b.type === "remove" ? "Removed (damaged, lost or used)" : "Stock count");
    const upd = await tx.product.update({ where: { id }, data: { inventory: { increment: delta }, ...(b.type === "add" && b.costPrice !== undefined ? { costPrice: b.costPrice } : {}) }, include: withCat });
    await tx.inventoryLog.create({ data: { productId: id, change: delta, price: b.type === "add" ? b.costPrice ?? p.costPrice ?? null : null, reason: `${reason} (by ${req.staff!.name})` } });
    return { upd, delta, before: p.inventory };
  });
  await audit(req, "stock", "inventory_product", id, { type: b.type, delta: out.delta, before: out.before, after: out.upd.inventory, reason: b.reason });
  send(res, productView(out.upd), `Stock is now ${out.upd.inventory}`);
}));

inventoryRouter.get("/logs", requirePermission("inventory.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const where: Prisma.InventoryLogWhereInput = q.productId ? { productId: q.productId } : {};
  const [rows, total] = await Promise.all([
    prisma.inventoryLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip, include: { product: { select: { name: true, unit: true } } } }),
    prisma.inventoryLog.count({ where }),
  ]);
  send(res, { items: rows.map((l) => ({ id: l.id, product: l.product.name, unit: l.product.unit, change: l.change, price: l.price, reason: l.reason, createdAt: l.createdAt })), total, page: pageNo, limit });
}));

// ---------- selling goods ----------
// The price always comes from the product, never from the request. A registered customer's phone earns points (Rs. 100 = 1).
const itemsSchema = z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(1000) })).max(40);
const mergeItems = (items: { productId: string; quantity: number }[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.quantity);
  return m;
};

inventoryRouter.post("/sales", requirePermission("inventory.sell"), handler(async (req, res) => {
  const b = parse(z.object({ phone: phone.optional(), payment: z.enum(["cash", "online"]).optional(), payments: paysSchema.optional(), fonepayQrId: z.string().min(1).optional(), customerName: z.string().trim().max(80).optional(), bookingId: z.string().min(1).optional(), items: itemsSchema.min(1, "Add at least one item") }), req.body);
  const merged = mergeItems(b.items);
  const customer = b.phone ? await prisma.user.findUnique({ where: { phoneNumber: b.phone }, select: { phoneNumber: true, name: true } }) : null;
  if (b.phone && !customer) throw new AppError(404, "No registered customer with this number. Leave the number empty for a walk-in sale.");
  const pay = { payments: b.payments, fonepayQrId: b.fonepayQrId, single: b.payment === "online" ? ("fonepay" as const) : b.payment === "cash" ? ("cash" as const) : undefined };
  // the slot (booking) this sale belongs to, so staff do not have to ask who it was for again
  const slot = b.bookingId ? await prisma.booking.findUnique({ where: { id: b.bookingId }, select: { id: true, customerName: true } }) : null;
  if (b.bookingId && !slot) throw new AppError(404, "That slot no longer exists");
  const who = { customerName: b.customerName || customer?.name || slot?.customerName || null, bookingId: slot?.id ?? null };

  const sale = (await prisma.$transaction((tx) => sellGoods(tx, merged, pay, req.staff!.id, customer?.phoneNumber ?? null, who))).sale;
  let points = 0;
  if (customer) {
    points = pointsForGoods(sale.amount);
    if (!(await awardPoints({ userId: customer.phoneNumber, kind: "goods", points, sourceType: "goods", sourceId: sale.id, detail: `Goods Rs. ${sale.amount}` }))) points = 0;
  }
  await audit(req, "sell", "inventory_sale", sale.id, { amount: sale.amount, items: sale.items, payment: b.payments ?? b.payment, customer: customer?.phoneNumber ?? "walk-in", points });
  send(res, { id: sale.id, amount: sale.amount, items: sale.items, points, customerName: customer?.name ?? null }, "Sale recorded", 201);
}));

inventoryRouter.get("/sales", requirePermission("inventory.view"), handler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { take, skip, pageNo, limit } = page(q);
  const [rows, total] = await Promise.all([prisma.goodsSale.findMany({ orderBy: { soldAt: "desc" }, take, skip }), prisma.goodsSale.count()]);
  const dueRows = await prisma.goodsDue.findMany({ where: { saleId: { in: rows.map((r) => r.id) } }, select: { saleId: true, status: true } });
  const credit = new Map(dueRows.map((d) => [d.saleId, d.status]));
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { phoneNumber: true, name: true } });
  const staff = await prisma.staffUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.soldBy))] } }, select: { id: true, name: true } });
  const bks = await prisma.booking.findMany({ where: { id: { in: rows.map((r) => r.bookingId).filter((x): x is string => !!x) } }, select: { id: true, date: true, startTime: true, endTime: true } });
  const slots = new Map(bks.map((b) => [b.id, `${b.date} ${b.startTime}-${b.endTime}`]));
  const un = new Map(users.map((u) => [u.phoneNumber, u.name])), sn = new Map(staff.map((s) => [s.id, s.name]));
  send(res, { items: rows.map((r) => ({ id: r.id, amount: r.amount, items: r.items, soldAt: r.soldAt, customerPhone: r.userId, customerName: (r.userId ? un.get(r.userId) : null) ?? r.customerName ?? null, slot: r.bookingId ? slots.get(r.bookingId) ?? null : null, soldBy: sn.get(r.soldBy) ?? null, credit: credit.get(r.id) ?? null })), total, page: pageNo, limit });
}));

// ---------- final bill: goods + games for one customer ----------
const gameLabelOf = (b: { date: string; startTime: string; endTime: string }) => `Game ${b.date} ${b.startTime}-${b.endTime}`;

// The customer's games from the last 7 days up to today, and any goods on credit, so the bill can include what they still owe.
inventoryRouter.get("/customer-bill", requirePermission("inventory.sell"), handler(async (req, res) => {
  const p = parse(phone, req.query.phone);
  const user = await prisma.user.findUnique({ where: { phoneNumber: p }, select: { phoneNumber: true, name: true } });
  if (!user) return send(res, { customer: null, games: [], goodsDues: [] });
  const today = todayKey();
  const [rows, dues] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: p, date: { gte: addDaysKey(today, -7), lte: today }, status: { notIn: DEAD }, NOT: { status: "pending" } },
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
    }),
    prisma.goodsDue.findMany({ where: { userId: p, status: "due" }, orderBy: { createdAt: "asc" } }),
  ]);
  send(res, {
    customer: { phone: user.phoneNumber, name: user.name },
    goodsDues: dues.map((d) => ({ id: d.id, items: d.items, amount: d.amount, createdAt: d.createdAt })),
    games: rows.map((b) => ({
      id: b.id, code: b.code, date: b.date, startTime: b.startTime, endTime: b.endTime, total: Math.round(b.totalPrice), status: b.status,
      paid: b.paymentStatus === "completed", paymentMethod: b.paymentMethod, pointsIfCompleted: b.status === "completed" ? pointsForGame(b.totalPrice) : 0, upcoming: b.status !== "completed",
    })),
  });
}));

// payment: "due" puts the goods on the customer's account to pay later (stock goes now, points come when it is paid)
inventoryRouter.post("/checkout", requirePermission("inventory.sell"), handler(async (req, res) => {
  const b = parse(z.object({
    phone, payment: z.enum(["cash", "online", "due"]).optional(), payments: paysSchema.optional(), fonepayQrId: z.string().min(1).optional(),
    items: itemsSchema.default([]), bookingIds: z.array(z.string().min(1)).max(40).default([]), goodsDueIds: z.array(z.string().min(1)).max(40).default([]),
  }), req.body);
  if (b.items.length === 0 && b.bookingIds.length === 0 && b.goodsDueIds.length === 0) throw new AppError(400, "Add goods or choose a game or a due to put on the bill");
  const customer = await prisma.user.findUnique({ where: { phoneNumber: b.phone }, select: { phoneNumber: true, name: true } });
  if (!customer) throw new AppError(404, "No registered customer with this number");
  const merged = mergeItems(b.items);
  const staffId = req.staff!.id;

  if (b.payment === "due") {
    if (merged.size === 0 || b.bookingIds.length || b.goodsDueIds.length) throw new AppError(400, "Pay later is only for goods: add the goods and nothing else");
    const c = await creditGoods(staffId, b.phone, merged);
    await notify(prisma, { userId: b.phone, type: "payment", title: `Goods on your account: Rs. ${c.total}`, message: `${c.sale.items}. You can pay it at the venue with your games.`, href: "/profile", dedupeKey: `goods-due-${c.due.id}` });
    await audit(req, "goods-credit", "inventory_due", c.due.id, { customer: b.phone, amount: c.total, items: c.sale.items });
    return send(res, { due: true, dueId: c.due.id, total: c.total, lines: c.lines, customerName: customer.name }, "Goods put on the customer's account", 201);
  }

  if ((b.bookingIds.length || b.goodsDueIds.length) && !req.staff!.permissions.includes("payments.collect")) throw new AppError(403, "You do not have permission to collect payments for games or dues");
  const games = await prisma.booking.findMany({ where: { id: { in: b.bookingIds }, userId: b.phone } });
  if (games.length !== new Set(b.bookingIds).size) throw new AppError(404, "One of the games is not on this customer's account");
  for (const g of games) if (DEAD.includes(g.status)) throw new AppError(409, `${gameLabelOf(g)} is ${g.status}`);
  const goodsDues = await prisma.goodsDue.findMany({ where: { id: { in: b.goodsDueIds }, userId: b.phone } });
  if (goodsDues.length !== new Set(b.goodsDueIds).size) throw new AppError(404, "One of the goods dues is not on this customer's account");

  const r = await settle({ staffId, userId: b.phone, bookings: games, goodsDues, items: merged, pay: { payments: b.payments, fonepayQrId: b.fonepayQrId, single: b.payment === "online" ? "fonepay" : b.payment === "cash" ? "cash" : undefined } });
  await audit(req, "checkout", "inventory_bill", r.id, { code: r.code, customer: b.phone, goods: r.goodsTotal, games: r.gameTotal, payments: r.payments, pointsGoods: r.pointsGoods, pointsGames: r.pointsGames });
  send(res, { ...r, customerName: customer.name }, "Bill saved", 201);
}));

inventoryRouter.get("/bills", requirePermission("inventory.view"), handler(async (req, res) => {
  const { take, skip, pageNo, limit } = page(req.query as Record<string, string | undefined>);
  const [rows, total] = await Promise.all([prisma.checkout.findMany({ orderBy: { createdAt: "desc" }, take, skip }), prisma.checkout.count()]);
  const users = await prisma.user.findMany({ where: { phoneNumber: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { phoneNumber: true, name: true } });
  const un = new Map(users.map((u) => [u.phoneNumber, u.name]));
  send(res, {
    items: rows.map((r) => ({ id: r.id, code: r.code, customerPhone: r.userId, customerName: un.get(r.userId) ?? null, total: r.total, goodsTotal: r.goodsTotal, gameTotal: r.gameTotal, paymentMethod: r.paymentMethod, lines: JSON.parse(r.lines), points: Number(r.pointsGoods) + Number(r.pointsGames), createdAt: r.createdAt })),
    total, page: pageNo, limit,
  });
}));
