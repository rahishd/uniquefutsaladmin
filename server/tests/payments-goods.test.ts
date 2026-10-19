import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

const clean = async () => { await reset(); await prisma.goodsDue.deleteMany(); };
before(clean);
beforeEach(clean);
after(async () => { await clean(); await prisma.$disconnect(); });

const PHONE = "9844444444";
const booking = () =>
  prisma.booking.create({ data: { userId: PHONE, customerName: "Ritesh test", customerPhone: PHONE, date: todayKey(), startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 1500, subtotal: 1500, totalPrice: 1500, paymentMethod: "venue", status: "confirmed", paymentStatus: "pending", source: "app" } as never });
const due = (extra: object = {}) =>
  prisma.goodsDue.create({ data: { userId: PHONE, saleId: `sale-${Math.random()}`, amount: 150, items: "6 x Mineral water", lines: JSON.stringify([{ type: "goods", label: "Mineral water", quantity: 6, amount: 150 }]), createdBy: "app:" + PHONE, ...extra } });

describe("Payments: the goods a customer took from the venue", () => {
  it("shows what is owed on each payment row and lists every item with who gave it", async () => {
    const owner = await staff("owner");
    await customer(PHONE, "Ritesh test");
    await booking();
    await due();
    await due({ amount: 80, items: "2 x Energy drink", lines: JSON.stringify([{ type: "goods", label: "Energy drink", quantity: 2, amount: 80 }]), createdBy: "Owner person" });
    await due({ amount: 50, items: "1 x Gloves", status: "paid", paidAt: new Date(), paidBy: "Owner person", lines: "[]" });

    const ledger = (await api.get("/payments/ledger?kind=court", owner.auth)).body.data;
    assert.deepEqual(ledger.items[0].goodsDue, { amount: 230, count: 2 }, "only unpaid goods count");

    const g = (await api.get(`/payments/customer-goods?phone=${PHONE}`, owner.auth)).body.data;
    assert.equal(g.dueTotal, 230);
    assert.equal(g.due.length, 2);
    const water = g.due.find((d: { items: string }) => d.items === "6 x Mineral water");
    assert.deepEqual(water.lines, [{ type: "goods", label: "Mineral water", quantity: 6, amount: 150 }]);
    assert.equal(water.source, "Ordered in the customer app");
    assert.equal(g.due.find((d: { items: string }) => d.items.includes("Energy")).by, "Owner person");
    assert.equal(g.paid.length, 1);
    assert.equal(g.paid[0].paidBy, "Owner person");
  });

  it("needs the payments permission and a phone number", async () => {
    const owner = await staff("owner");
    assert.equal((await api.get("/payments/customer-goods", owner.auth)).status, 400);
    assert.equal((await api.get(`/payments/customer-goods?phone=${PHONE}`, {})).status, 401);
  });
});
