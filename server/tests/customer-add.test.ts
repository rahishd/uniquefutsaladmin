import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, app, prisma, request, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(async () => { await reset(); await prisma.$disconnect(); });

async function staffWith(permissions: string[], email = "p@test.np") {
  const s = await prisma.staffUser.create({ data: { email, name: "Desk", role: "staff", permissions, passwordHash: await bcrypt.hash("correct-horse-battery", 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: "correct-horse-battery" });
  return { id: s.id, auth: { Authorization: `Bearer ${login.body.data.token}` } as Record<string, string> };
}

describe("staff add a customer by hand", () => {
  it("needs its own permission", async () => {
    const viewer = await staffWith(["customers.view"]);
    assert.equal((await api.post("/customers", viewer.auth, { name: "Ram Thapa", phoneNumber: "9841000001" })).status, 403);
    const adder = await staffWith(["customers.view", "customers.create"], "adder@test.np");
    assert.equal((await api.post("/customers", adder.auth, { name: "Ram Thapa", phoneNumber: "9841000001" })).status, 201);
    // an older account with the coarse "customers.write" keeps working
    const old = await staffWith(["customers.write"], "old@test.np");
    assert.equal((await api.post("/customers", old.auth, { name: "Sita Rai", phoneNumber: "9841000002" })).status, 201);
  });

  it("a record without a password cannot sign in; with a password the customer signs in with the mobile number", async () => {
    const owner = await staff("owner");
    const plain = await api.post("/customers", owner.auth, { name: "  Hari Gurung ", phoneNumber: "9841000003", email: "Hari@Test.np" });
    assert.equal(plain.status, 201);
    assert.deepEqual([plain.body.data.name, plain.body.data.email, plain.body.data.canSignIn, plain.body.data.password], ["Hari Gurung", "hari@test.np", false, undefined]);
    const row = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: "9841000003" } });
    assert.deepEqual([row.role, row.isVerified, row.isActive], ["user", true, true]);
    assert.ok(row.password.startsWith("$2"), "stored hashed, never plain");

    const withPw = await api.post("/customers", owner.auth, { name: "Gita Karki", phoneNumber: "9841000004", password: "gita-pass-1" });
    assert.equal(withPw.body.data.canSignIn, true);
    assert.equal(await bcrypt.compare("gita-pass-1", (await prisma.user.findUniqueOrThrow({ where: { phoneNumber: "9841000004" } })).password), true);
    assert.equal(await bcrypt.compare("anything-else", row.password), false);

    // shows up in the customer list
    const list = (await api.get("/customers?q=9841000004", owner.auth)).body.data;
    assert.equal(list.items[0].name, "Gita Karki");
  });

  it("refuses bad input, a number or email already in use, and never logs the password", async () => {
    const owner = await staff("owner");
    for (const bad of [{ name: "R", phoneNumber: "9841000005" }, { name: "Ram Thapa", phoneNumber: "1234567890" }, { name: "Ram Thapa", phoneNumber: "9841000005", email: "not-an-email" }, { name: "Ram Thapa", phoneNumber: "9841000005", password: "123" }]) {
      assert.equal((await api.post("/customers", owner.auth, bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await api.post("/customers", owner.auth, { name: "First", phoneNumber: "9841000006", email: "same@test.np", password: "secret-pass-9" })).status, 201);
    assert.equal((await api.post("/customers", owner.auth, { name: "Second", phoneNumber: "9841000006" })).status, 409, "number already registered");
    assert.equal((await api.post("/customers", owner.auth, { name: "Third", phoneNumber: "9841000007", email: "same@test.np" })).status, 409, "email already used");
    assert.equal(await prisma.user.count({ where: { phoneNumber: "9841000007" } }), 0);

    const log = await prisma.adminAuditLog.findFirst({ where: { action: "create-customer", entityId: "9841000006" } });
    assert.ok(log && !log.details!.includes("secret-pass-9") && log.details!.includes('"signIn":true'));
  });
});

describe("customer totals", () => {
  it("the list always carries the whole-site numbers, whatever the search or filter", async () => {
    const owner = await staff("owner");
    for (const [phone, active] of [["9842000001", true], ["9842000002", true], ["9842000003", false]] as const) {
      await prisma.user.create({ data: { phoneNumber: phone, name: "C" + phone.slice(-1), password: "x", role: "user", isVerified: true, isActive: active } });
    }
    await prisma.userPrefs.create({ data: { userId: "9842000001", mode: "captain" } });
    const all = (await api.get("/customers", owner.auth)).body.data;
    assert.deepEqual(all.totals, { registered: 3, active: 2, suspended: 1, captains: 1 });
    const narrow = (await api.get("/customers?q=9842000003&status=suspended", owner.auth)).body.data;
    assert.equal(narrow.total, 1, "this filter matches one person");
    assert.equal(narrow.totals.registered, 3, "but the total stays the whole site");
    // staff accounts are not customers
    assert.equal((await api.get("/customers", owner.auth)).body.data.totals.registered, 3);
    // adding a customer raises it
    await api.post("/customers", owner.auth, { name: "New One", phoneNumber: "9842000004" });
    assert.equal((await api.get("/customers", owner.auth)).body.data.totals.registered, 4);
  });
});
