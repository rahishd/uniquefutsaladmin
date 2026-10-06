import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, app, customer, PASSWORD, prisma, request, reset, staff, todayKey } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

// A staff account with exactly these permissions, signed in.
async function staffWith(permissions: string[], email = "custom@test.np", role = "staff") {
  const s = await prisma.staffUser.create({ data: { email, name: "Custom Staff", role, permissions, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { id: s.id, auth: { Authorization: `Bearer ${login.body.data.token}` } as Record<string, string>, login: login.body.data };
}

const tomorrow = addDaysKey(todayKey(), 1);
const walkIn = (hour = "10:00") => ({ date: tomorrow, startTime: hour, customerName: "Ram" });
const promo = { code: "STAFF10", type: "percent", value: 10, label: "10% off", appliedTo: "booking" };

describe("owner, admin and staff accounts", () => {
  it("the catalog is grouped like the pages, each tick is one small action, and owner-only powers are never offered", async () => {
    const owner = await staff("owner");
    const c = (await api.get("/staff/catalog", owner.auth)).body.data;
    assert.ok(c.sections.length >= 14);
    const keys = c.sections.flatMap((s: { permissions: { key: string }[] }) => s.permissions.map((p) => p.key));
    assert.equal(keys.length, c.assignable.length);
    assert.ok(keys.length >= 40, "small, specific permissions");
    for (const k of ["bookings.create", "bookings.cancel", "payments.collect", "payments.refund", "courts.price", "courts.block", "promos.delete", "customers.suspend", "vip.manage", "loyalty.void", "gamezone.catalog", "complaints.reply"]) assert.ok(keys.includes(k), k);
    assert.equal(keys.includes("staff.manage"), false);
    assert.ok(c.presets.some((p: { id: string }) => p.id === "frontdesk"));
    for (const p of c.presets) for (const perm of p.permissions) assert.ok(c.assignable.includes(perm), `${p.id} offers ${perm}`);
  });

  it("only the owner manages accounts; an admin has every other permission; staff have only what is ticked", async () => {
    const owner = await staff("owner");
    const adm = await staffWith([], "admin@test.np", "admin");
    assert.equal(adm.login.admin.isAdmin, true);
    assert.equal(adm.login.admin.isOwner, false);
    assert.equal(adm.login.admin.permissions.includes("staff.manage"), false);
    for (const path of ["/bookings", "/payments/ledger", "/customers", "/complaints", "/courts/pricing", "/promos", "/vip", "/membership/plans", "/reports/revenue", "/audit", "/dashboard"]) {
      assert.equal((await api.get(path, adm.auth)).status, 200, `admin can open ${path}`);
    }
    assert.equal((await api.get("/staff", adm.auth)).status, 403, "an admin cannot open Staff & Roles");
    assert.equal((await api.post("/staff", adm.auth, { email: "x@test.np", name: "Sneaky", accountType: "admin", password: "long-enough-pass" })).status, 403);
    assert.equal((await api.get("/staff", owner.auth)).status, 200);
    assert.equal(owner.id.length > 0 && (await request(app).post("/api/admin/auth/login").send({ email: "owner@test.np", password: PASSWORD })).body.data.admin.isOwner, true);

    const s = await staffWith(["bookings.view"]);
    assert.equal((await api.get("/staff", s.auth)).status, 403);
    assert.equal((await api.patch(`/staff/${s.id}`, s.auth, { permissions: ASSIGNABLE_SAMPLE })).status, 403, "staff cannot give themselves more");
  });

  it("each action is its own tick: view, create, cancel, complete are separate", async () => {
    const viewer = await staffWith(["bookings.view"]);
    assert.equal((await api.get("/bookings", viewer.auth)).status, 200);
    assert.equal((await api.post("/bookings/walk-in", viewer.auth, walkIn())).status, 403);
    assert.equal((await api.get("/courts/slots", viewer.auth)).status, 403, "the slots timeline is its own tick");
    assert.equal((await api.get("/arrivals", viewer.auth)).status, 403);

    const booker = await staffWith(["bookings.view", "bookings.create"], "booker@test.np");
    const made = await api.post("/bookings/walk-in", booker.auth, walkIn());
    assert.equal(made.status, 201);
    assert.equal((await api.post(`/bookings/${made.body.data.id}/cancel`, booker.auth)).status, 403, "creating is not cancelling");
    assert.equal((await api.post(`/bookings/${made.body.data.id}/complete`, booker.auth)).status, 403);
    assert.equal((await api.post(`/bookings/${made.body.data.id}/no-show`, booker.auth)).status, 403);

    const canceller = await staffWith(["bookings.view", "bookings.cancel"], "canceller@test.np");
    assert.equal((await api.post(`/bookings/${made.body.data.id}/cancel`, canceller.auth)).status, 200);
    assert.equal((await api.post("/bookings/walk-in", canceller.auth, walkIn("11:00"))).status, 403, "cancelling is not creating");
  });

  it("money actions are separate from looking: view, collect, refund", async () => {
    const view = await staffWith(["payments.view"]);
    assert.equal((await api.get("/payments/ledger", view.auth)).status, 200);
    assert.equal((await api.post("/payments/UF-NONE/mark-paid", view.auth)).status, 403);
    const collect = await staffWith(["payments.view", "payments.collect"], "collect@test.np");
    assert.equal((await api.post("/payments/UF-NONE/mark-paid", collect.auth)).status, 404, "allowed through, the order just does not exist");
    assert.equal((await api.post("/payments/UF-NONE/refund", collect.auth, { method: "cash" })).status, 403, "collecting is not refunding");
    const refund = await staffWith(["payments.refund"], "refund@test.np");
    assert.equal((await api.post("/payments/UF-NONE/refund", refund.auth, { method: "cash" })).status, 404, "allowed through, the order just does not exist");
  });

  it("promo codes, prices and blocked hours, customers and VIP are split into small ticks too", async () => {
    await customer("9840000001", "Tick Test");
    const mgr = await staff("manager");
    await api.post("/promos", mgr.auth, promo);

    const p = await staffWith(["promos.view"]);
    assert.equal((await api.get("/promos", p.auth)).status, 200);
    assert.equal((await api.post("/promos", p.auth, { ...promo, code: "NEWONE" })).status, 403);
    assert.equal((await api.put("/promos/STAFF10", p.auth, { ...promo, value: 20 })).status, 403);
    assert.equal((await api.del("/promos/STAFF10", p.auth)).status, 403);
    const pc = await staffWith(["promos.view", "promos.create", "promos.edit"], "pc@test.np");
    assert.equal((await api.post("/promos", pc.auth, { ...promo, code: "NEWONE" })).status, 201);
    assert.equal((await api.put("/promos/STAFF10", pc.auth, { ...promo, value: 20 })).status, 200);
    assert.equal((await api.del("/promos/STAFF10", pc.auth)).status, 403, "editing is not deleting");
    const pd = await staffWith(["promos.delete"], "pd@test.np");
    assert.equal((await api.del("/promos/STAFF10", pd.auth)).status, 200);

    const price = await staffWith(["courts.view", "courts.price"], "price@test.np");
    assert.equal((await api.put("/courts/pricing", price.auth, { hourlyRate: 1100 })).status, 200);
    assert.equal((await api.post("/courts/blocks", price.auth, { date: tomorrow, hours: [10], reason: "Repair" })).status, 403, "pricing is not blocking");
    const block = await staffWith(["courts.view", "courts.block"], "block@test.np");
    assert.equal((await api.post("/courts/blocks", block.auth, { date: tomorrow, hours: [10], reason: "Repair" })).status, 201);
    assert.equal((await api.put("/courts/pricing", block.auth, { hourlyRate: 1200 })).status, 403, "blocking is not pricing");

    const cust = await staffWith(["customers.view", "customers.edit"], "cust@test.np");
    assert.equal((await api.patch("/customers/9840000001", cust.auth, { name: "Renamed Person" })).status, 200);
    assert.equal((await api.post("/customers/9840000001/suspend", cust.auth)).status, 403, "editing is not suspending");
    assert.equal((await api.put("/customers/9840000001/vip", cust.auth, { code: "VIPTEST", type: "percent", value: 10 })).status, 403);
    const susp = await staffWith(["customers.suspend"], "susp@test.np");
    assert.equal((await api.post("/customers/9840000001/suspend", susp.auth)).status, 200);
    const vip = await staffWith(["vip.view", "vip.manage"], "vip@test.np");
    assert.equal((await api.post("/vip", vip.auth, { phone: "9840000001", code: "VIPTEST", type: "percent", value: 10 })).status, 201);
  });

  it("Gamezone, loyalty and complaints are split too", async () => {
    await customer("9840000002", "Loyal One");
    const gz = await staffWith(["gamezone.view", "gamezone.collect"]);
    assert.equal((await api.post("/gamezone/consoles", gz.auth, { name: "PS5 Station 9" })).status, 403, "collecting is not editing the catalog");
    assert.equal((await api.post("/gamezone/bookings/GZ-NONE/cancel", gz.auth)).status, 403);
    assert.equal((await api.post("/gamezone/bookings/GZ-NONE/mark-paid", gz.auth)).status, 404);
    const cat = await staffWith(["gamezone.catalog"], "cat@test.np");
    assert.equal((await api.post("/gamezone/consoles", cat.auth, { name: "PS5 Station 9" })).status, 201);

    const l = await staffWith(["loyalty.view", "loyalty.goods"], "loy@test.np");
    assert.equal((await api.post("/loyalty/goods-sale", l.auth, { phone: "9840000002", amount: 500 })).status, 201);
    assert.equal((await api.post("/loyalty/adjust", l.auth, { phone: "9840000002", points: 5, reason: "goodwill gift" })).status, 403);
    assert.equal((await api.post("/loyalty/vouchers/none/void", l.auth)).status, 403);
    const adj = await staffWith(["loyalty.adjust"], "adj@test.np");
    assert.equal((await api.post("/loyalty/adjust", adj.auth, { phone: "9840000002", points: 5, reason: "goodwill gift" })).status, 200);
    assert.equal((await api.post("/loyalty/vouchers/none/void", adj.auth)).status, 403, "adjusting is not voiding");

    const c = await prisma.complaint.create({ data: { code: "CP-TICK01", userId: "9840000002", category: "other", message: "A long enough complaint message." } });
    const cv = await staffWith(["complaints.view"], "cv@test.np");
    assert.equal((await api.get("/complaints", cv.auth)).status, 200);
    assert.equal((await api.patch(`/complaints/${c.id}`, cv.auth, { status: "closed" })).status, 403);
    const cr = await staffWith(["complaints.reply"], "cr@test.np");
    assert.equal((await api.patch(`/complaints/${c.id}`, cr.auth, { status: "closed" })).status, 200);
  });

  it("a staff account with nothing ticked can sign in but every action says no", async () => {
    const none = await staffWith([]);
    for (const path of ["/bookings", "/payments/ledger", "/customers", "/dashboard", "/reports/revenue", "/audit"]) assert.equal((await api.get(path, none.auth)).status, 403, path);
    assert.equal((await api.get("/auth/me", none.auth)).status, 200);
  });

  it("changing the ticks takes effect on the person's very next request, without signing in again", async () => {
    const owner = await staff("owner");
    const s = await staffWith(["bookings.view"]);
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 403);
    const upd = await api.patch(`/staff/${s.id}`, owner.auth, { permissions: ["bookings.view", "payments.view"] });
    assert.equal(upd.status, 200);
    assert.deepEqual(upd.body.data.effective.sort(), ["bookings.view", "payments.view"]);
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 200, "same token, new access");
    await api.patch(`/staff/${s.id}`, owner.auth, { permissions: [] });
    assert.equal((await api.get("/payments/ledger", s.auth)).status, 403);
    await api.patch(`/staff/${s.id}`, owner.auth, { isActive: false });
    assert.equal((await api.get("/dashboard", s.auth)).status, 401);
  });

  it("refuses owner-only powers, things that do not exist, and the old coarse names when ticking", async () => {
    const owner = await staff("owner");
    const s = await staffWith(["bookings.view"]);
    const make = (permissions: string[]) => api.post("/staff", owner.auth, { email: `p${Math.random()}@test.np`, name: "Test Staff", accountType: "staff", permissions, password: "long-enough-pass" });
    assert.equal((await make(["staff.manage"])).status, 400);
    assert.equal((await make(["bookings.view", "nonsense.perm"])).status, 400);
    assert.equal((await make(["bookings.read"])).status, 400, "ticks use the new small permissions");
    assert.equal((await api.patch(`/staff/${s.id}`, owner.auth, { permissions: ["staff.manage"] })).status, 400);
    assert.equal((await make(["bookings.view", "bookings.view"])).body.data.permissions.length, 1, "duplicates are merged");
    const adm = (await api.post("/staff", owner.auth, { email: "a2@test.np", name: "Admin Two", accountType: "admin", password: "long-enough-pass" })).body.data;
    assert.equal((await api.patch(`/staff/${adm.id}`, owner.auth, { permissions: ["bookings.view"] })).status, 400, "admins already have everything");
  });

  it("older accounts keep working: older roles and older coarse permission names are understood", async () => {
    const owner = await staff("owner");
    const old = await staffWith(["bookings.read", "bookings.write", "payments.write"], "old@test.np");
    assert.equal((await api.post("/bookings/walk-in", old.auth, walkIn())).status, 201);
    assert.equal((await api.get("/bookings", old.auth)).status, 200);
    assert.equal((await api.post("/payments/UF-NONE/refund", old.auth, { method: "cash" })).status, 404, "payments.write used to include refunds, so it is allowed through");
    const fd = await staff("frontdesk");
    const before = (await api.get("/staff", owner.auth)).body.data.find((x: { id: string }) => x.id === fd.id);
    assert.equal(before.legacyRole, true);
    assert.ok(before.effective.includes("bookings.create"));
    const conv = await api.patch(`/staff/${fd.id}`, owner.auth, { accountType: "staff" });
    assert.equal(conv.body.data.role, "staff");
    assert.equal(conv.body.data.legacyRole, false);
    assert.deepEqual(conv.body.data.effective.sort(), before.effective.sort(), "nothing is lost when an older role is converted");
  });

  it("an admin can become staff and back; the owner cannot demote or disable themselves", async () => {
    const owner = await staff("owner");
    const adm = (await api.post("/staff", owner.auth, { email: "a3@test.np", name: "Admin Three", accountType: "admin", password: "long-enough-pass" })).body.data;
    const down = await api.patch(`/staff/${adm.id}`, owner.auth, { accountType: "staff", permissions: ["bookings.view", "gamezone.view"] });
    assert.deepEqual(down.body.data.effective.sort(), ["bookings.view", "gamezone.view"]);
    const up = await api.patch(`/staff/${adm.id}`, owner.auth, { accountType: "admin" });
    assert.equal(up.body.data.accountType, "admin");
    assert.deepEqual(up.body.data.permissions, []);
    assert.equal(up.body.data.effective.includes("staff.manage"), false, "admins never manage accounts");
    assert.equal((await api.patch(`/staff/${owner.id}`, owner.auth, { accountType: "staff", permissions: [] })).status, 400);
    assert.equal((await api.patch(`/staff/${owner.id}`, owner.auth, { isActive: false })).status, 400);
    assert.equal((await prisma.staffUser.findUniqueOrThrow({ where: { id: owner.id } })).isActive, true);
  });

  it("the owner can change a login email and password at any time, and delete an account", async () => {
    const owner = await staff("owner");
    const made = (await api.post("/staff", owner.auth, { email: "Sita@Test.np", name: "Sita", accountType: "staff", password: "long-enough-pass", permissions: ["bookings.view"] })).body.data;
    assert.equal(made.email, "sita@test.np");
    const login = (email: string, password: string) => request(app).post("/api/admin/auth/login").send({ email, password });
    const first = await login("sita@test.np", "long-enough-pass");
    assert.equal(first.status, 200);

    // another account already uses that email
    await api.post("/staff", owner.auth, { email: "ram@test.np", name: "Ram", accountType: "staff", password: "long-enough-pass" });
    assert.equal((await api.patch(`/staff/${made.id}`, owner.auth, { email: "RAM@test.np" })).status, 409);
    assert.equal((await api.patch(`/staff/${made.id}`, owner.auth, { email: "not-an-email" })).status, 400);

    // new login email and new password: the old ones stop working, the new ones work
    const changed = await api.patch(`/staff/${made.id}`, owner.auth, { email: "sita.new@test.np", password: "brand-new-password" });
    assert.equal(changed.body.data.email, "sita.new@test.np");
    assert.equal((await login("sita@test.np", "long-enough-pass")).status, 401);
    assert.equal((await login("sita.new@test.np", "long-enough-pass")).status, 401);
    assert.equal((await login("sita.new@test.np", "brand-new-password")).status, 200);
    const log = await prisma.adminAuditLog.findFirst({ where: { entity: "staff", entityId: made.id, action: "update" }, orderBy: { createdAt: "desc" } });
    assert.ok(log!.details!.includes("sita.new@test.np") && !log!.details!.includes("brand-new-password"));

    // only the owner may do it
    const adm = (await api.post("/staff", owner.auth, { email: "adm@test.np", name: "Adm", accountType: "admin", password: "long-enough-pass" })).body.data;
    const admLogin = await login("adm@test.np", "long-enough-pass");
    const admAuth = { Authorization: `Bearer ${admLogin.body.data.token}` };
    assert.equal((await api.patch(`/staff/${made.id}`, admAuth, { email: "x@test.np" })).status, 403);
    assert.equal((await request(app).delete(`/api/admin/staff/${made.id}`).set(admAuth)).status, 403);

    // delete: gone for good, the signed-in session stops at once, the audit log remembers
    const live = (await login("sita.new@test.np", "brand-new-password")).body.data.token as string;
    assert.equal((await request(app).delete(`/api/admin/staff/${made.id}`).set(owner.auth)).status, 200);
    assert.equal(await prisma.staffUser.count({ where: { id: made.id } }), 0);
    assert.equal((await request(app).get("/api/admin/auth/me").set({ Authorization: `Bearer ${live}` })).status, 401);
    assert.equal((await login("sita.new@test.np", "brand-new-password")).status, 401);
    assert.ok(await prisma.adminAuditLog.findFirst({ where: { action: "delete", entity: "staff", entityId: made.id } }));
    assert.equal((await request(app).delete(`/api/admin/staff/${made.id}`).set(owner.auth)).status, 404);

    // you cannot delete yourself
    assert.equal((await request(app).delete(`/api/admin/staff/${owner.id}`).set(owner.auth)).status, 400);
    assert.equal(adm.accountType, "admin");
  });

  it("a password change signs the person out everywhere (the owner changing it, or the person changing their own)", async () => {
    const owner = await staff("owner");
    const login = async (email: string, password: string) => (await request(app).post("/api/admin/auth/login").send({ email, password })).body.data.token as string;
    const me = (t: string) => request(app).get("/api/admin/auth/me").set({ Authorization: `Bearer ${t}` });
    const made = (await api.post("/staff", owner.auth, { email: "pw@test.np", name: "Pw", accountType: "staff", password: "long-enough-pass", permissions: ["bookings.view"] })).body.data;

    // the owner resets it: both of their devices are signed out at once, even in the same second
    const phone = await login("pw@test.np", "long-enough-pass");
    const laptop = await login("pw@test.np", "long-enough-pass");
    assert.equal((await me(phone)).status, 200);
    await api.patch(`/staff/${made.id}`, owner.auth, { password: "reset-by-the-owner" });
    assert.equal((await me(phone)).status, 401);
    assert.equal((await me(laptop)).status, 401);
    assert.equal((await api.patch(`/staff/${made.id}`, owner.auth, { name: "Pw Renamed" })).status, 200);
    const fresh = await login("pw@test.np", "reset-by-the-owner");
    assert.equal((await me(fresh)).status, 200, "signing in again works");

    // a name or permission change does not sign anyone out
    await api.patch(`/staff/${made.id}`, owner.auth, { permissions: ["bookings.view", "slots.view"] });
    assert.equal((await me(fresh)).status, 200);

    // changing your own password: other devices go, this one stays signed in with the new token it is given
    const other = await login("pw@test.np", "reset-by-the-owner");
    const change = await request(app).post("/api/admin/auth/change-password").set({ Authorization: `Bearer ${fresh}` }).send({ current: "reset-by-the-owner", next: "my-own-new-password" });
    assert.equal(change.status, 200);
    assert.equal((await me(other)).status, 401);
    assert.equal((await me(fresh)).status, 401, "the old token of this device is replaced");
    assert.equal((await me(change.body.data.token)).status, 200);
  });

  it("a new login email signs the person out too; editing your own login keeps this device signed in", async () => {
    const owner = await staff("owner");
    const login = async (email: string, password: string) => (await request(app).post("/api/admin/auth/login").send({ email, password })).body.data.token as string;
    const me = (t: string) => request(app).get("/api/admin/auth/me").set({ Authorization: `Bearer ${t}` });
    const made = (await api.post("/staff", owner.auth, { email: "mail@test.np", name: "Mail", accountType: "staff", password: "long-enough-pass", permissions: ["bookings.view"] })).body.data;

    const phone = await login("mail@test.np", "long-enough-pass");
    // the same email written in other letters is not a change: nobody is signed out
    await api.patch(`/staff/${made.id}`, owner.auth, { email: "MAIL@test.np" });
    assert.equal((await me(phone)).status, 200);
    await api.patch(`/staff/${made.id}`, owner.auth, { email: "mail.new@test.np" });
    assert.equal((await me(phone)).status, 401);
    assert.equal((await me(await login("mail.new@test.np", "long-enough-pass"))).status, 200);

    // the owner edits their own password and login: other devices go, this device gets a new token and stays in
    const ownerPhone = await login("owner@test.np", PASSWORD);
    const own = await api.patch(`/staff/${owner.id}`, owner.auth, { email: "boss@test.np", password: "owner-new-password" });
    assert.equal(own.status, 200);
    assert.equal((await me(ownerPhone)).status, 401);
    assert.equal((await me(owner.token)).status, 401);
    assert.equal((await me(own.body.data.token)).status, 200);
    assert.equal(own.body.data.email, "boss@test.np");
  });

  it("records every access change in the audit log, without passwords", async () => {
    const owner = await staff("owner");
    const created = await api.post("/staff", owner.auth, { email: "aud@test.np", name: "Audited", accountType: "staff", permissions: ["bookings.view"], password: "secret-password-77" });
    await api.patch(`/staff/${created.body.data.id}`, owner.auth, { permissions: ["bookings.view", "payments.view"], password: "another-secret-88" });
    const text = JSON.stringify((await api.get("/audit?entity=staff", owner.auth)).body.data.items);
    assert.ok(text.includes("payments.view"));
    assert.equal(text.includes("secret-password-77"), false);
    assert.equal(text.includes("another-secret-88"), false);
    assert.equal(text.includes("passwordHash"), false);
  });
});

const ASSIGNABLE_SAMPLE = ["bookings.view", "payments.collect"];
