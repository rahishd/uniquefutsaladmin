import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, app, PASSWORD, prisma, request, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

// A staff account with exactly these permissions, signed in.
async function staffWith(permissions: string[], email = "custom@test.np", role = "staff") {
  const s = await prisma.staffUser.create({ data: { email, name: "Custom Staff", role, permissions, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { id: s.id, auth: { Authorization: `Bearer ${login.body.data.token}` } as Record<string, string>, login: login.body.data };
}

const walkIn = { date: addDaysKey(todayKey(), 1), startTime: "10:00", customerName: "Ram" };

describe("admin and staff accounts", () => {
  it("the catalog lists every feature, the quick-start presets, and never offers admin-only powers", async () => {
    const owner = await staff("owner");
    const c = (await api.get("/staff/catalog", owner.auth)).body.data;
    assert.ok(c.features.length >= 12);
    assert.deepEqual(c.features.find((f: { id: string }) => f.id === "payments").full, ["payments.read", "payments.write"]);
    assert.ok(c.presets.some((p: { id: string }) => p.id === "frontdesk"));
    assert.equal(c.assignable.includes("staff.manage"), false);
    assert.equal(c.assignable.includes("settings.write"), false);
    for (const p of c.presets) for (const perm of p.permissions) assert.ok(c.assignable.includes(perm), `${p.id} offers ${perm}`);
  });

  it("an admin account gets all access, including managing staff; a staff account never manages staff", async () => {
    const owner = await staff("owner");
    const made = await api.post("/staff", owner.auth, { email: "boss@test.np", name: "Second Admin", accountType: "admin", password: "long-enough-pass" });
    assert.equal(made.status, 201);
    assert.equal(made.body.data.accountType, "admin");
    assert.deepEqual(made.body.data.permissions, []);
    const login = await request(app).post("/api/admin/auth/login").send({ email: "boss@test.np", password: "long-enough-pass" });
    assert.equal(login.body.data.admin.isAdmin, true);
    assert.ok(login.body.data.admin.permissions.includes("staff.manage"));
    assert.ok(login.body.data.admin.permissions.includes("payments.write"));
    const admin = { Authorization: `Bearer ${login.body.data.token}` };
    assert.equal((await api.get("/staff", admin)).status, 200);
    assert.equal((await api.post("/staff", admin, { email: "new@test.np", name: "New Staff", accountType: "staff", permissions: ["bookings.read"], password: "long-enough-pass" })).status, 201);

    const s = await staffWith(["bookings.read", "bookings.write", "payments.read", "payments.write"]);
    assert.equal(s.login.admin.isAdmin, false);
    assert.equal((await api.get("/staff", s.auth)).status, 403);
    assert.equal((await api.post("/staff", s.auth, { email: "x@test.np", name: "Sneaky", accountType: "admin", password: "long-enough-pass" })).status, 403);
  });

  it("a staff account can do only what was ticked", async () => {
    const viewOnly = await staffWith(["bookings.read"]);
    assert.equal((await api.get("/bookings", viewOnly.auth)).status, 200);
    assert.equal((await api.get("/courts/slots", viewOnly.auth)).status, 200);
    assert.equal((await api.post("/bookings/walk-in", viewOnly.auth, walkIn)).status, 403, "view only cannot book");
    assert.equal((await api.get("/payments/ledger", viewOnly.auth)).status, 403);
    assert.equal((await api.get("/customers", viewOnly.auth)).status, 403);
    assert.equal((await api.get("/complaints", viewOnly.auth)).status, 403);
    assert.equal((await api.get("/reports/revenue", viewOnly.auth)).status, 403);
    assert.equal((await api.get("/audit", viewOnly.auth)).status, 403);
    assert.equal((await api.get("/dashboard", viewOnly.auth)).status, 200, "the dashboard is open to every account");

    const booker = await staffWith(["bookings.read", "bookings.write"], "booker@test.np");
    assert.equal((await api.post("/bookings/walk-in", booker.auth, walkIn)).status, 201);
    assert.equal((await api.post("/payments/UF-NONE/refund", booker.auth, { method: "cash" })).status, 403, "booking access is not payment access");

    const none = await staffWith([], "none@test.np");
    assert.equal((await api.get("/bookings", none.auth)).status, 403);
    assert.equal((await api.get("/dashboard", none.auth)).status, 200);
  });

  it("pricing and promo codes have their own view permission, separate from bookings", async () => {
    const s = await staffWith(["bookings.read"]);
    assert.equal((await api.get("/courts/pricing", s.auth)).status, 403);
    assert.equal((await api.get("/courts/blocks", s.auth)).status, 403);
    assert.equal((await api.get("/promos", s.auth)).status, 403);
    const p = await staffWith(["courts.read", "promos.read"], "price@test.np");
    assert.equal((await api.get("/courts/pricing", p.auth)).status, 200);
    assert.equal((await api.get("/promos", p.auth)).status, 200);
    assert.equal((await api.put("/courts/pricing", p.auth, { hourlyRate: 1000 })).status, 403, "view is not edit");
    const e = await staffWith(["courts.read", "courts.write"], "edit@test.np");
    assert.equal((await api.put("/courts/pricing", e.auth, { hourlyRate: 1000 })).status, 200);
  });

  it("changing what a staff member may do takes effect on their very next request, without signing in again", async () => {
    const owner = await staff("owner");
    const s = await staffWith(["bookings.read"]);
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 403);
    const upd = await api.patch(`/staff/${s.id}`, owner.auth, { permissions: ["bookings.read", "payments.read"] });
    assert.equal(upd.status, 200);
    assert.deepEqual(upd.body.data.effective.sort(), ["bookings.read", "payments.read"]);
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 200, "same token, new access");
    await api.patch(`/staff/${s.id}`, owner.auth, { permissions: [] });
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 403);
    await api.patch(`/staff/${s.id}`, owner.auth, { isActive: false });
    assert.equal((await api.get("/dashboard", s.auth)).status, 401);
    assert.equal((await api.get("/auth/me", (await staffWith(["bookings.read"], "again@test.np")).auth)).body.data.permissions[0], "bookings.read");
  });

  it("refuses to give staff admin-only powers or things that do not exist", async () => {
    const owner = await staff("owner");
    const s = await staffWith(["bookings.read"]);
    const make = (permissions: string[]) => api.post("/staff", owner.auth, { email: `p${Math.random()}@test.np`, name: "Test Staff", accountType: "staff", permissions, password: "long-enough-pass" });
    assert.equal((await make(["staff.manage"])).status, 400);
    assert.equal((await make(["settings.write"])).status, 400);
    assert.equal((await make(["bookings.read", "nonsense.perm"])).status, 400);
    assert.equal((await api.patch(`/staff/${s.id}`, owner.auth, { permissions: ["staff.manage"] })).status, 400);
    assert.equal((await make(["bookings.read", "bookings.read"])).body.data.permissions.length, 1, "duplicates are merged");
    // admins already have everything: picking permissions for them is refused
    const adm = (await api.post("/staff", owner.auth, { email: "a2@test.np", name: "Admin Two", accountType: "admin", password: "long-enough-pass" })).body.data;
    assert.equal((await api.patch(`/staff/${adm.id}`, owner.auth, { permissions: ["bookings.read"] })).status, 400);
  });

  it("an admin can turn into staff and back; converting an older role keeps what it could do", async () => {
    const owner = await staff("owner");
    const adm = (await api.post("/staff", owner.auth, { email: "a3@test.np", name: "Admin Three", accountType: "admin", password: "long-enough-pass" })).body.data;
    const down = await api.patch(`/staff/${adm.id}`, owner.auth, { accountType: "staff", permissions: ["bookings.read", "gamezone.read"] });
    assert.deepEqual(down.body.data.effective.sort(), ["bookings.read", "gamezone.read"]);
    const up = await api.patch(`/staff/${adm.id}`, owner.auth, { accountType: "admin" });
    assert.equal(up.body.data.accountType, "admin");
    assert.deepEqual(up.body.data.permissions, []);
    assert.ok(up.body.data.effective.includes("staff.manage"));

    const fd = await staff("frontdesk");
    const before = (await api.get("/staff", owner.auth)).body.data.find((x: { id: string }) => x.id === fd.id);
    assert.equal(before.legacyRole, true);
    assert.ok(before.effective.includes("bookings.write"));
    const conv = await api.patch(`/staff/${fd.id}`, owner.auth, { accountType: "staff" });
    assert.equal(conv.body.data.role, "staff");
    assert.equal(conv.body.data.legacyRole, false);
    assert.deepEqual(conv.body.data.effective.sort(), before.effective.sort(), "nothing is lost when an older role is converted");
  });

  it("protects the owner: only an owner changes the owner account, you cannot demote yourself, one owner always remains", async () => {
    const owner = await staff("owner");
    const adm = (await api.post("/staff", owner.auth, { email: "a4@test.np", name: "Admin Four", accountType: "admin", password: "long-enough-pass" })).body.data;
    const admToken = (await request(app).post("/api/admin/auth/login").send({ email: "a4@test.np", password: "long-enough-pass" })).body.data.token;
    const admin = { Authorization: `Bearer ${admToken}` };
    assert.equal((await api.patch(`/staff/${owner.id}`, admin, { isActive: false })).status, 403, "an admin cannot disable the owner");
    assert.equal((await api.patch(`/staff/${owner.id}`, admin, { password: "attackers-new-pass" })).status, 403, "or reset the owner's password");
    assert.equal((await api.patch(`/staff/${owner.id}`, owner.auth, { accountType: "staff", permissions: [] })).status, 400, "an owner cannot demote themselves");
    assert.equal((await api.patch(`/staff/${adm.id}`, admin, { isActive: false })).status, 400, "nor disable themselves");
    assert.equal((await prisma.staffUser.findUniqueOrThrow({ where: { id: owner.id } })).isActive, true);
  });

  it("records every access change in the audit log, without passwords", async () => {
    const owner = await staff("owner");
    const created = await api.post("/staff", owner.auth, { email: "aud@test.np", name: "Audited", accountType: "staff", permissions: ["bookings.read"], password: "secret-password-77" });
    await api.patch(`/staff/${created.body.data.id}`, owner.auth, { permissions: ["bookings.read", "payments.read"], password: "another-secret-88" });
    const log = (await api.get("/audit?entity=staff", owner.auth)).body.data.items;
    const text = JSON.stringify(log);
    assert.ok(log.length >= 2);
    assert.ok(text.includes("payments.read"));
    assert.equal(text.includes("secret-password-77"), false);
    assert.equal(text.includes("another-secret-88"), false);
    assert.equal(text.includes("passwordHash"), false);
  });
});
