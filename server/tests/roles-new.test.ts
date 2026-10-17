import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, customer, PASSWORD, prisma, reset, staff } from "./helpers";
import { PRESETS } from "../src/lib/permissions";

before(reset);
beforeEach(async () => {
  await reset();
  await prisma.$executeRawUnsafe('DELETE FROM "DocVerification"');
  await prisma.$executeRawUnsafe('DELETE FROM "Checkout"');
});
after(() => prisma.$disconnect());

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.permissions;
async function asStaff(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { Authorization: `Bearer ${login.body.data.token}` };
}

describe("roles for the newest actions", () => {
  it("the quick starts match what each job needs", () => {
    assert.ok(preset("frontdesk").includes("verify.view"));
    assert.ok(!preset("frontdesk").includes("verify.manage"), "the front desk looks codes up, it does not make document codes");
    assert.ok(preset("accountant").includes("verify.view"));
    assert.ok(preset("documents").includes("verify.manage") && preset("documents").includes("verify.view"));
    assert.ok(preset("marketing").includes("content.birthdays") && preset("marketing").includes("notifications.send"));
    assert.ok(!preset("marketing").includes("verify.manage"));
    assert.ok(preset("viewer").includes("verify.view") && !preset("viewer").some((p) => p === "verify.manage" || p === "content.birthdays"));
    assert.ok(preset("manager").includes("verify.manage") && preset("manager").includes("content.birthdays"));
    assert.ok(!preset("gamezone").some((p) => p.startsWith("verify.") || p === "content.birthdays"));
  });

  it("the Staff & Roles page can offer them: the list has the new sections and quick starts", async () => {
    const s = await staff("owner");
    const r = await api.get("/staff/catalog", s.auth);
    assert.equal(r.status, 200);
    const keys = r.body.data.sections.flatMap((x: { permissions: { key: string }[] }) => x.permissions.map((p) => p.key));
    for (const k of ["verify.view", "verify.manage", "content.birthdays", "notifications.send"]) assert.ok(keys.includes(k), k);
    const ids = r.body.data.presets.map((p: { id: string }) => p.id);
    for (const id of ["frontdesk", "accountant", "gamezone", "marketing", "documents", "manager", "viewer"]) assert.ok(ids.includes(id), id);
  });

  it("an account made from a quick start can do exactly that", async () => {
    const owner = await staff("owner");
    const docs = await asStaff(preset("documents"), "docs@test.np");
    const desk = await asStaff(preset("frontdesk"), "desk@test.np");
    const mkt = await asStaff(preset("marketing"), "mkt@test.np");
    const body = { title: "Letter", issuedTo: "Test College", orgType: "college", photos: [] };
    assert.equal((await api.post("/verify/documents", docs, body)).status, 201);
    assert.equal((await api.post("/verify/documents", desk, body)).status, 403);
    assert.equal((await api.get("/verify", desk)).status, 200);
    assert.equal((await api.get("/verify", mkt)).status, 403);
    await customer("9800000981", "Born Today");
    await prisma.user.update({ where: { phoneNumber: "9800000981" }, data: { dateOfBirth: `${Number(new Date().getUTCFullYear()) - 25}${new Date(Date.now() + 20700000).toISOString().slice(4, 10)}` } });
    assert.equal((await api.get("/content/birthdays", mkt)).status, 200);
    assert.equal((await api.post("/content/birthdays/wish", mkt, { phones: ["9800000981"] })).status, 201);
    assert.equal((await api.post("/content/birthdays/wish", desk, { phones: ["9800000981"] })).status, 403);
    assert.equal((await api.post("/content/birthdays/wish", owner.auth, { phones: ["9800000981"] })).status, 201); // already wished by marketing: the answer is still fine (nothing is sent twice)
  });

  it("a bill's code can be read by whoever hands out bills, and not by unrelated staff", async () => {
    await customer("9800000982", "Bill Payer");
    const c = await prisma.checkout.create({ data: { code: "CB-ROLE01", userId: "9800000982", paymentMethod: "cash", goodsTotal: 100, gameTotal: 0, total: 100, lines: "[]", createdBy: "x" } });
    const url = `/verify/bill-code?type=checkout&id=${c.id}`;
    assert.equal((await api.get(url, await asStaff(["inventory.sell"], "sell@test.np"))).status, 200);
    assert.equal((await api.get(url, await asStaff(["payments.collect"], "collect@test.np"))).status, 200);
    assert.equal((await api.get(url, await asStaff(["content.view"], "content@test.np"))).status, 403);
    assert.equal((await api.get(url, await asStaff([], "none@test.np"))).status, 403);
  });
});
