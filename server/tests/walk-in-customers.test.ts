import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const game = (over: Record<string, unknown>) =>
  prisma.booking.create({
    data: { date: "2099-02-01", startTime: "18:00", endTime: "19:00", duration: 1, basePrice: 2000, subtotal: 2000, totalPrice: 2000, paymentMethod: "venue", paymentStatus: "completed", status: "confirmed", notes: "WALK_IN", ...over } as never,
  });

describe("Walk-in customers: booked at the desk, no app account, Owner and Admins only", () => {
  it("lists them by number, searches by name, and keeps out people who have an account", async () => {
    const owner = await staff("owner");
    await game({ customerName: "Ram Thapa", customerPhone: "9898989898", code: "W1" });
    await game({ customerName: "Ram Thapa", customerPhone: "9898989898", date: "2099-02-02", paymentStatus: "pending", code: "W2" });
    await game({ customerName: "Sita Rai", customerPhone: null, code: "W3" });
    await game({ customerName: "Has Account", customerPhone: "9811111111", code: "W4" });
    await prisma.user.create({ data: { phoneNumber: "9811111111", name: "Has Account", password: await bcrypt.hash(PASSWORD, 4), role: "user" } as never });
    await game({ customerName: "Regular", customerPhone: "9822222222", notes: "regular booking", code: "W5" });

    const all = (await api.get("/customers/walk-ins", owner.auth)).body.data;
    assert.equal(all.total, 2, "Ram (one row for two games) and Sita; not the one with an account, not a normal booking");
    const ram = all.items.find((x: { phone: string }) => x.phone === "9898989898");
    assert.equal(ram.games, 2);
    assert.equal(ram.paid, 2000);
    assert.equal(ram.unpaid, 2000);

    assert.equal((await api.get("/customers/walk-ins?q=9898", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/customers/walk-ins?q=sita", owner.auth)).body.data.items[0].name, "Sita Rai");

    const rec = (await api.get("/customers/walk-ins/records?phone=9898989898", owner.auth)).body.data;
    assert.equal(rec.games.length, 2);
    const byName = (await api.get("/customers/walk-ins/records?name=Sita%20Rai", owner.auth)).body.data;
    assert.equal(byName.games.length, 1);
    assert.equal((await api.get("/customers/walk-ins/records", owner.auth)).status, 400);
  });

  it("is refused to staff who are not the Owner or an Admin, even with the customers permission", async () => {
    await prisma.staffUser.create({ data: { email: "desk@test.np", name: "Desk", role: "staff", permissions: ["customers.view"], passwordHash: await bcrypt.hash(PASSWORD, 4) } });
    const login = await request(app).post("/api/admin/auth/login").send({ email: "desk@test.np", password: PASSWORD });
    const desk = { Authorization: `Bearer ${login.body.data.token}` };
    await game({ customerName: "Ram Thapa", customerPhone: "9898989898", code: "W1" });
    assert.equal((await api.get("/customers/walk-ins", desk)).status, 403);
    assert.equal((await api.get("/customers/walk-ins/records?phone=9898989898", desk)).status, 403);
    const admin = await staff("admin");
    assert.equal((await api.get("/customers/walk-ins", admin.auth)).status, 200);
  });
});
