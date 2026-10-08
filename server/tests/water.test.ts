import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(async () => { await reset(); await prisma.$disconnect(); });

const day = addDaysKey(todayKey(), 3);
const bottles = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).waterBottles;

describe("complimentary mineral water on bookings made by staff", () => {
  it("a manual booking includes 2 bottles by default, none when staff turn it off", async () => {
    const owner = await staff("owner");
    const on = await api.post("/bookings/walk-in", owner.auth, { date: day, startTime: "10:00", customerName: "Ram" });
    assert.equal(on.status, 201);
    assert.deepEqual(on.body.data.water, { bottles: 2, excluded: null });
    assert.equal(await bottles(on.body.data.id), 2);

    const off = await api.post("/bookings/walk-in", owner.auth, { date: day, startTime: "11:00", customerName: "Sita", water: false });
    assert.deepEqual(off.body.data.water, { bottles: 0, excluded: "staff" });
    assert.equal(await bottles(off.body.data.id), 0);
  });

  it("a VIP customer never gets it, even when it is switched on", async () => {
    const owner = await staff("owner");
    await customer("9840000101", "Vip Player");
    await customer("9840000102", "Plain Player");
    await prisma.vipCode.create({ data: { userId: "9840000101", code: "ADMINVIP", type: "percent", value: 10, createdBy: owner.id } });

    const vip = await api.post("/bookings/walk-in", owner.auth, { date: day, startTime: "12:00", customerName: "Vip Player", customerPhone: "9840000101", water: true });
    assert.deepEqual(vip.body.data.water, { bottles: 0, excluded: "vip" });
    assert.equal(await bottles(vip.body.data.id), 0);

    const plain = await api.post("/bookings/walk-in", owner.auth, { date: day, startTime: "13:00", customerName: "Plain Player", customerPhone: "9840000102" });
    assert.deepEqual(plain.body.data.water, { bottles: 2, excluded: null });

    // a paused VIP code no longer counts
    await prisma.vipCode.update({ where: { userId: "9840000101" }, data: { active: false } });
    const paused = await api.post("/bookings/walk-in", owner.auth, { date: day, startTime: "14:00", customerName: "Vip Player", customerPhone: "9840000101" });
    assert.equal(paused.body.data.water.bottles, 2);
  });

  it("bulk booking follows the same rule for every game", async () => {
    const owner = await staff("owner");
    const dates = [addDaysKey(todayKey(), 4), addDaysKey(todayKey(), 5)];
    const r = await api.post("/bookings/walk-in/bulk", owner.auth, { dates, startTime: "15:00", customerName: "Team", water: false });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.data.water, { bottles: 0, excluded: "staff" });
    for (const b of r.body.data.created) assert.equal(await bottles(b.id), 0);

    const on = await api.post("/bookings/walk-in/bulk", owner.auth, { dates: [addDaysKey(todayKey(), 6)], startTime: "15:00", customerName: "Team" });
    assert.equal(await bottles(on.body.data.created[0].id), 2);
  });
});

describe("promo codes: the water switch", () => {
  const promo = { code: "WATERTEST", type: "percent", value: 10, label: "10% off", appliedTo: "booking" };

  it("is off by default (no water with a promo) and can be switched on or off", async () => {
    const owner = await staff("owner");
    const made = await api.post("/promos", owner.auth, promo);
    assert.equal(made.status, 201);
    assert.equal(made.body.data.includesWater, false);

    const on = await api.put("/promos/WATERTEST", owner.auth, { ...promo, includesWater: true });
    assert.equal(on.status, 200);
    const list = (await api.get("/promos", owner.auth)).body.data as { code: string; includesWater?: boolean }[];
    assert.equal(list.find((p) => p.code === "WATERTEST")?.includesWater, true);
    const stored = JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "promoCodes" } })).value) as { code: string; includesWater?: boolean }[];
    assert.equal(stored.find((p) => p.code === "WATERTEST")?.includesWater, true, "saved where the customer app reads it");

    await api.put("/promos/WATERTEST", owner.auth, { ...promo, includesWater: false });
    const off = JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "promoCodes" } })).value) as { includesWater?: boolean }[];
    assert.equal(off[0].includesWater, false);
  });
});
