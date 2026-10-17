import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import sharp from "sharp";
import { api, app, customer, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(async () => {
  await reset();
  await prisma.$executeRawUnsafe('DELETE FROM "DocVerification"');
  await prisma.$executeRawUnsafe('DELETE FROM "Checkout"');
});
after(() => prisma.$disconnect());

const photo = async () => {
  const buf = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#cccccc" } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
};
const doc = async (over: object = {}) => ({ title: "Partnership letter", issuedTo: "Everest Bank", orgType: "bank", details: "Monthly corporate bookings.", photos: [await photo()], ...over });

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { Authorization: `Bearer ${login.body.data.token}` };
}

describe("Verify Document: documents for other organisations", () => {
  it("makes a 4-digit code with the organisation, notes and photos, and lists it", async () => {
    const s = await staff("owner");
    const r = await api.post("/verify/documents", s.auth, await doc());
    assert.equal(r.status, 201);
    assert.match(r.body.data.code, /^[1-9]\d{3}$/);
    assert.equal(r.body.data.issuedTo, "Everest Bank");
    assert.equal(r.body.data.photos.length, 1);
    assert.match(r.body.data.photos[0], /^\/api\/content\/media\//);
    const list = await api.get("/verify", s.auth);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.documents.length, 1);
    assert.equal(list.body.data.documents[0].code, r.body.data.code);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "create", entity: "doc_verification" } }), 1);
  });

  it("never gives two documents the same code", async () => {
    const s = await staff("owner");
    const codes = new Set<string>();
    for (let i = 0; i < 15; i++) codes.add((await api.post("/verify/documents", s.auth, await doc({ title: `Letter ${i}`, photos: [] }))).body.data.code);
    assert.equal(codes.size, 15);
  });

  it("checks the form: title, who it is for, and at most 6 photos", async () => {
    const s = await staff("owner");
    assert.equal((await api.post("/verify/documents", s.auth, await doc({ title: "x" }))).status, 400);
    assert.equal((await api.post("/verify/documents", s.auth, await doc({ issuedTo: "" }))).status, 400);
    assert.equal((await api.post("/verify/documents", s.auth, await doc({ orgType: "cinema" }))).status, 400);
    const p = await photo();
    assert.equal((await api.post("/verify/documents", s.auth, await doc({ photos: Array(7).fill(p) }))).status, 400);
    assert.equal((await api.post("/verify/documents", s.auth, await doc({ photos: ["data:text/plain;base64,aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ="] }))).status, 400); // not a picture
  });

  it("can be withdrawn and restored; the lookup shows it", async () => {
    const s = await staff("owner");
    const made = (await api.post("/verify/documents", s.auth, await doc({ photos: [] }))).body.data;
    assert.equal((await api.get(`/verify/lookup/${made.code}`, s.auth)).body.data.genuine, true);
    const off = await api.patch(`/verify/${made.id}`, s.auth, { revoked: true });
    assert.equal(off.status, 200);
    assert.equal((await api.get(`/verify/lookup/${made.code}`, s.auth)).body.data.genuine, false);
    await api.patch(`/verify/${made.id}`, s.auth, { revoked: false });
    assert.equal((await api.get(`/verify/lookup/${made.code}`, s.auth)).body.data.genuine, true);
    assert.equal((await api.get("/verify/lookup/9999", s.auth)).body.data.found, false);
    assert.equal((await api.get("/verify/lookup/12", s.auth)).status, 400);
  });

  it("needs the right permission: viewing is not creating", async () => {
    const viewer = await staffWith(["verify.view"], "verify-viewer@test.np");
    assert.equal((await api.get("/verify", viewer)).status, 200);
    assert.equal((await api.post("/verify/documents", viewer, await doc({ photos: [] }))).status, 403);
    const nobody = await staffWith(["content.view"], "verify-nobody@test.np");
    assert.equal((await api.get("/verify", nobody)).status, 403);
    assert.equal((await request(app).get("/api/admin/verify")).status, 401);
  });
});

describe("Verify Document: bills", () => {
  it("gives a bill its code once, and the same code every time", async () => {
    const s = await staff("owner");
    await customer("9800000951", "Bill Payer");
    const c = await prisma.checkout.create({ data: { code: "CB-TEST01", userId: "9800000951", paymentMethod: "cash", goodsTotal: 100, gameTotal: 0, total: 100, lines: "[]", createdBy: "x" } });
    const a = await api.get(`/verify/bill-code?type=checkout&id=${c.id}`, s.auth);
    assert.equal(a.status, 200);
    assert.match(a.body.data.code, /^\d{4}$/);
    const b = await api.get(`/verify/bill-code?type=checkout&id=${c.id}`, s.auth);
    assert.equal(b.body.data.code, a.body.data.code);
    assert.equal((await api.get("/verify/bill-code?type=checkout&id=nope", s.auth)).status, 404);
    assert.equal((await api.get("/verify/bill-code?type=other&id=1", s.auth)).status, 400);
    const list = await api.get("/verify", s.auth);
    assert.deepEqual(list.body.data.bills.map((x: { reference: string; customer: string; total: number }) => [x.reference, x.customer, x.total]), [["CB-TEST01", "Bill Payer", 100]]);
  });
});
