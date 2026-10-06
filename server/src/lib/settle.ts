// One place where money is collected at the counter: games, goods on credit (dues) and new goods, paid in one go, in one or more payment methods.
// Used by the Sell goods bill and by the Dues screen on a booking, so both follow exactly the same rules.
import { randomInt } from "crypto";
import { Booking, GoodsDue, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { awardForCompletedBooking, awardPoints, notify, pointsForGoods } from "./customer-effects";
import { AppError } from "./http";

export type Tx = Prisma.TransactionClient;

// ---------- payment methods and splitting ----------
export const PAY_METHODS = ["cash", "fonepay"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export type Pay = { method: PayMethod; amount: number };
export const paysSchema = z.array(z.object({ method: z.enum(PAY_METHODS), amount: z.number().int().min(1).max(10_000_000) })).min(1).max(3);
// What the caller sent: a list of payments (split), or one method for the whole amount
// fonepayQrId: the paid Fonepay QR that covers the Fonepay part (required whenever there is one)
export type PayInput = { payments?: Pay[]; single?: PayMethod; fonepayQrId?: string };

export function resolvePays(input: PayInput, total: number): Pay[] {
  let pays: Pay[];
  if (input.payments?.length) {
    const merged = new Map<PayMethod, number>();
    for (const p of input.payments) merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount);
    pays = [...merged].map(([method, amount]) => ({ method, amount }));
  } else if (input.single) pays = [{ method: input.single, amount: total }];
  else throw new AppError(400, "Choose how it was paid");
  const sum = pays.reduce((s, p) => s + p.amount, 0);
  if (sum !== total) throw new AppError(400, `The payments add up to Rs. ${sum}, but the total is Rs. ${total}`);
  return pays;
}

type Share = { cash: number; fonepay: number };
// Hands out the payments to each line in order, so every line knows how much of it was cash and how much online.
export function allocate(lineAmounts: number[], pays: Pay[]): Share[] {
  const pool = pays.map((p) => ({ ...p }));
  let i = 0;
  return lineAmounts.map((amount) => {
    const share: Share = { cash: 0, fonepay: 0 };
    let need = amount;
    while (need > 0 && i < pool.length) {
      const take = Math.min(need, pool[i].amount);
      share[pool[i].method] += take;
      pool[i].amount -= take;
      need -= take;
      if (pool[i].amount === 0) i++;
    }
    return share;
  });
}
const online = (s: Share) => s.fonepay;
// The booking's main method is the one that paid most of it
const dominant = (s: Share): "venue" | "fonepay" => (s.cash >= s.fonepay ? "venue" : "fonepay");

// The Fonepay part of a bill must be backed by a QR the gateway has marked paid, for exactly that amount, and not used before.
// Staff cannot say "it was paid": only the gateway can (callback or status check), see lib/fonepay.ts.
export async function claimFonepay(tx: Tx, input: PayInput, pays: Pay[], usedFor: string) {
  const part = pays.find((p) => p.method === "fonepay");
  if (!part) return;
  if (!input.fonepayQrId) throw new AppError(400, "Make the Fonepay QR and wait until it is paid before saving");
  const q = await tx.fonepayQr.findUnique({ where: { id: input.fonepayQrId } });
  if (!q) throw new AppError(404, "Fonepay QR not found");
  if (q.status !== "paid") throw new AppError(409, "The Fonepay QR has not been paid yet");
  if (q.consumedAt) throw new AppError(409, "This Fonepay payment was already used for another bill");
  if (q.amount !== part.amount) throw new AppError(409, `The QR is for Rs. ${q.amount} but the Fonepay part is Rs. ${part.amount}. Make a new QR.`);
  const claimed = await tx.fonepayQr.updateMany({ where: { id: q.id, consumedAt: null }, data: { consumedAt: new Date(), consumedFor: usedFor } });
  if (claimed.count === 0) throw new AppError(409, "This Fonepay payment was already used for another bill");
}

// ---------- helpers ----------
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export async function billCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = "CB-" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!(await prisma.checkout.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new AppError(500, "Could not make a bill number");
}
export const DEAD = ["cancelled", "expired", "rejected"];
export const gameLabel = (b: { date: string; startTime: string; endTime: string }) => `Game ${b.date} ${b.startTime}-${b.endTime}`;

export async function lockProducts(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
}

// ---------- goods ----------
export type GoodsLine = { p: { id: string; name: string; price: number; inventory: number }; qty: number; amount: number };

// Locks the products and checks the stock. The price always comes from the product, never from the request.
export async function buildGoods(tx: Tx, merged: Map<string, number>): Promise<GoodsLine[]> {
  const ids = [...merged.keys()];
  if (ids.length === 0) return [];
  await lockProducts(tx, ids);
  const products = await tx.product.findMany({ where: { id: { in: ids } } });
  if (products.length !== ids.length) throw new AppError(404, "One of the products no longer exists");
  return products.map((p) => {
    const qty = merged.get(p.id)!;
    if (p.inventory < qty) throw new AppError(409, `Only ${p.inventory} ${p.name} in stock, not ${qty}`);
    return { p, qty, amount: Math.round(p.price * qty) };
  });
}

// Takes the stock, writes the log (with the cash / online split) and the GoodsSale row.
export async function commitGoods(tx: Tx, lines: GoodsLine[], staffId: string, phoneNo: string | null, shares: Share[]) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const sale = await tx.goodsSale.create({
    data: { userId: phoneNo, phone: phoneNo, amount: total, items: lines.map((l) => `${l.qty} x ${l.p.name}`).join(", ").slice(0, 190), soldBy: staffId },
  });
  for (const [i, l] of lines.entries()) {
    await tx.product.update({ where: { id: l.p.id }, data: { inventory: { decrement: l.qty } } });
    await tx.inventoryLog.create({ data: { productId: l.p.id, change: -l.qty, price: l.p.price, reason: `Goods Sale #${sale.id}`, cashAmount: shares[i]?.cash ?? 0, onlineAmount: shares[i] ? online(shares[i]) : 0 } });
  }
  return { sale, total, lines: lines.map((l) => ({ type: "goods" as const, label: l.p.name, quantity: l.qty, amount: l.amount })) };
}

// A counter sale paid now (one or several methods).
export async function sellGoods(tx: Tx, merged: Map<string, number>, pay: PayInput, staffId: string, phoneNo: string | null) {
  const lines = await buildGoods(tx, merged);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const pays = resolvePays(pay, total);
  await claimFonepay(tx, pay, pays, "counter sale");
  return commitGoods(tx, lines, staffId, phoneNo, allocate(lines.map((l) => l.amount), pays));
}

// Goods given on credit: the stock goes now, the money is a due that is collected later with the games.
export async function creditGoods(staffId: string, phoneNo: string, merged: Map<string, number>) {
  return prisma.$transaction(async (tx) => {
    const lines = await buildGoods(tx, merged);
    const s = await commitGoods(tx, lines, staffId, phoneNo, []);
    const due = await tx.goodsDue.create({ data: { userId: phoneNo, saleId: s.sale.id, amount: s.total, items: s.sale.items ?? "", lines: JSON.stringify(s.lines), createdBy: staffId } });
    return { sale: s.sale, due, lines: s.lines, total: s.total };
  });
}

// ---------- the final bill ----------
export type SettleInput = {
  staffId: string;
  userId: string | null; // the customer's account (a bill is saved for it); null for a guest
  bookings: Booking[]; // already checked to belong to this customer
  goodsDues: GoodsDue[]; // already checked to belong to this customer
  items: Map<string, number>; // new goods bought now
  pay: PayInput;
};

export async function settle(inp: SettleInput) {
  const code = inp.userId ? await billCode() : null;
  const games = [...inp.bookings].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const out = await prisma.$transaction(async (tx) => {
    const goods = await buildGoods(tx, inp.items);
    type L = { kind: "game"; row: Booking; amount: number } | { kind: "due"; row: GoodsDue; amount: number } | { kind: "goods"; amount: number };
    const lines: L[] = [
      ...games.map((row) => ({ kind: "game" as const, row, amount: Math.round(row.totalPrice) })),
      ...inp.goodsDues.map((row) => ({ kind: "due" as const, row, amount: row.amount })),
      ...goods.map((g) => ({ kind: "goods" as const, amount: g.amount })),
    ];
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (total <= 0) throw new AppError(400, "There is nothing to collect");
    const pays = resolvePays(inp.pay, total);
    await claimFonepay(tx, inp.pay, pays, code ?? "counter");
    const shares = allocate(lines.map((l) => l.amount), pays);
    const bill: { type: "game" | "goods"; label: string; quantity: number; amount: number }[] = [];
    let gameTotal = 0, dueTotal = 0;
    const dueSales: { saleId: string; amount: number }[] = [];
    for (const [i, l] of lines.entries()) {
      const s = shares[i];
      if (l.kind === "game") {
        const g = l.row;
        const claimed = await tx.booking.updateMany({
          where: { id: g.id, paymentStatus: { not: "completed" } }, // only one request can move it to paid, so a game is never charged twice
          data: { paymentStatus: "completed", status: g.status === "pending" ? "confirmed" : g.status, holdExpiresAt: null, paymentMethod: dominant(s), amountPaidNow: g.totalPrice, remainingAmount: 0, cashAmount: g.cashAmount + s.cash, onlineAmount: g.onlineAmount + online(s) },
        });
        if (claimed.count === 0) throw new AppError(409, `${gameLabel(g)} is already paid`);
        if (g.paymentOrderCode) {
          await tx.paymentOrder.updateMany({ where: { orderCode: g.paymentOrderCode, status: { in: ["pending", "expired"] } }, data: { status: "paid", paidAt: new Date(), paidBy: inp.staffId } });
          await tx.paymentEvent.create({ data: { orderCode: g.paymentOrderCode, source: "staff", payload: JSON.stringify({ event: "MARKED_PAID", by: inp.staffId, bill: code, split: pays }) } });
        }
        gameTotal += l.amount;
        bill.push({ type: "game", label: gameLabel(g), quantity: 1, amount: l.amount });
      } else if (l.kind === "due") {
        const claimed = await tx.goodsDue.updateMany({ where: { id: l.row.id, status: "due" }, data: { status: "paid", paidAt: new Date(), paidBy: inp.staffId, checkoutCode: code, cashAmount: s.cash, onlineAmount: online(s) } });
        if (claimed.count === 0) throw new AppError(409, `The goods on credit (${l.row.items}) are already paid`);
        dueTotal += l.amount;
        dueSales.push({ saleId: l.row.saleId, amount: l.amount });
        bill.push({ type: "goods", label: l.row.items, quantity: 1, amount: l.amount });
      }
    }
    let newSale: { id: string; amount: number } | null = null;
    if (goods.length) {
      const first = lines.findIndex((l) => l.kind === "goods");
      const c = await commitGoods(tx, goods, inp.staffId, inp.userId, shares.slice(first));
      newSale = { id: c.sale.id, amount: c.total };
      bill.push(...c.lines);
    }
    const goodsTotal = dueTotal + (newSale?.amount ?? 0);
    const methods = new Set(pays.map((p) => (p.method === "cash" ? "cash" : "online")));
    const row = inp.userId
      ? await tx.checkout.create({
          data: { code: code!, userId: inp.userId, paymentMethod: pays.length > 1 ? "split" : methods.has("cash") ? "cash" : "online", goodsTotal, gameTotal, total, lines: JSON.stringify(bill), bookingIds: games.map((g) => g.id), goodsSaleId: newSale?.id ?? null, createdBy: inp.staffId },
        })
      : null;
    return { row, bill, total, gameTotal, goodsTotal, newSale, dueSales, pays };
  });

  // Loyalty points: goods (Rs. 100 = 1) when they are paid, each game that has been played when it is paid; a game still to be played earns its points when it is completed.
  let pointsGoods = 0, pointsGames = 0, waiting = 0;
  if (inp.userId) {
    for (const s of [...out.dueSales, ...(out.newSale ? [{ saleId: out.newSale.id, amount: out.newSale.amount }] : [])]) {
      const pts = pointsForGoods(s.amount);
      if (await awardPoints({ userId: inp.userId, kind: "goods", points: pts, sourceType: "goods", sourceId: s.saleId, detail: `Goods Rs. ${s.amount}${code ? ` (bill ${code})` : ""}` })) pointsGoods += pts;
    }
  }
  for (const g of games) {
    const fresh = await prisma.booking.findUnique({ where: { id: g.id } });
    if (!fresh) continue;
    if (fresh.status === "completed") { if (await awardForCompletedBooking(fresh)) pointsGames += Math.floor(Math.max(0, fresh.totalPrice) / 10) / 10; } else waiting++;
  }
  pointsGames = Math.round(pointsGames * 10) / 10;
  if (out.row) {
    await prisma.checkout.update({ where: { id: out.row.id }, data: { pointsGoods: new Prisma.Decimal(pointsGoods.toFixed(1)), pointsGames: new Prisma.Decimal(pointsGames.toFixed(1)) } });
    const how = out.pays.length > 1 ? "in cash and by Fonepay" : out.pays[0].method === "cash" ? "in cash" : "by Fonepay";
    await notify(prisma, { userId: inp.userId!, type: "payment", title: `Bill ${code}: Rs. ${out.total}`, message: `Paid ${how} at the venue.${pointsGoods + pointsGames ? ` You earned ${Math.round((pointsGoods + pointsGames) * 10) / 10} loyalty points.` : ""}`, href: "/profile", dedupeKey: `bill-${code}` });
  }
  return { id: out.row?.id ?? null, code, total: out.total, goodsTotal: out.goodsTotal, gameTotal: out.gameTotal, lines: out.bill, pointsGoods, pointsGames, gamesWaitingForPoints: waiting, payments: out.pays, count: games.length + inp.goodsDues.length };
}
