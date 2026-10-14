import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import sharp from "sharp";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

// a small logo with a transparent corner, so we can check transparency survives
const logo = async (w = 400, h = 200) => {
  const raw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { raw[i * 4] = 20; raw[i * 4 + 1] = 60; raw[i * 4 + 2] = 160; raw[i * 4 + 3] = i < w ? 0 : 255; }
  const buf = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
};

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

describe("Corporate Network logos", () => {
  it("adds logos with their names, in the order they were added, and keeps transparency", async () => {
    const mgr = await staff("admin");
    const a = await api.post("/content/partners", mgr.auth, { name: "Nabil Bank", image: await logo() });
    assert.equal(a.status, 201);
    assert.equal(a.body.data.name, "Nabil Bank");
    assert.equal(a.body.data.visible, true);
    const b = await api.post("/content/partners", mgr.auth, { name: "Rotary", image: await logo(1600, 900) });
    assert.equal(b.status, 201);
    const m = await prisma.contentMedia.findFirst({ where: { id: b.body.data.imageUrl.split("/").pop() } });
    assert.ok(m && m.mime === "image/webp" && m.width <= 600 && m.height <= 360, "shrunk to fit 600 x 360 and stored as WebP");
    const meta = await sharp(m!.data).metadata();
    assert.equal(meta.hasAlpha, true, "the transparent background is kept");
    const list = (await api.get("/content/partners", mgr.auth)).body.data;
    assert.deepEqual(list.map((p: { name: string }) => p.name), ["Nabil Bank", "Rotary"]);
  });

  it("refuses bad pictures and empty names", async () => {
    const mgr = await staff("admin");
    assert.equal((await api.post("/content/partners", mgr.auth, { name: "", image: await logo() })).status, 400);
    assert.equal((await api.post("/content/partners", mgr.auth, { name: "X", image: "data:text/html;base64," + "A".repeat(80) })).status, 400);
    assert.equal((await api.post("/content/partners", mgr.auth, { name: "X", image: "data:image/png;base64," + Buffer.from("not an image at all, only text").toString("base64") })).status, 400);
    assert.equal(await prisma.sitePartner.count(), 0);
    assert.equal(await prisma.contentMedia.count(), 0, "nothing saved for a bad picture");
  });

  it("renames, hides, replaces the picture, reorders and deletes (the picture goes too)", async () => {
    const mgr = await staff("admin");
    const a = (await api.post("/content/partners", mgr.auth, { name: "A", image: await logo() })).body.data;
    const b = (await api.post("/content/partners", mgr.auth, { name: "B", image: await logo() })).body.data;
    const r = await api.patch(`/content/partners/${a.id}`, mgr.auth, { name: "A2", visible: false });
    assert.equal(r.body.data.name, "A2");
    assert.equal(r.body.data.visible, false);
    const swapped = await api.patch(`/content/partners/${b.id}`, mgr.auth, { image: await logo(300, 300) });
    assert.notEqual(swapped.body.data.imageUrl, b.imageUrl, "a replacement gets a new picture id");
    assert.equal(await prisma.contentMedia.count(), 2, "the old picture was removed");
    assert.equal((await api.post("/content/partners/reorder", mgr.auth, { ids: [b.id, a.id] })).status, 200);
    assert.deepEqual((await api.get("/content/partners", mgr.auth)).body.data.map((p: { name: string }) => p.name), ["B", "A2"]);
    assert.equal((await api.post("/content/partners/reorder", mgr.auth, { ids: [a.id, "nope"] })).status, 400);
    assert.equal((await api.del(`/content/partners/${a.id}`, mgr.auth)).status, 200);
    assert.equal(await prisma.contentMedia.count(), 1);
    assert.equal((await api.del(`/content/partners/${a.id}`, mgr.auth)).status, 404);
  });

  it("needs its own permission to change; viewing needs content.view; signed-out visitors cannot upload", async () => {
    const v = await staffWith(["content.view"], "v@test.np");
    assert.equal((await api.get("/content/partners", v.auth)).status, 200);
    assert.equal((await api.post("/content/partners", v.auth, { name: "X", image: await logo() })).status, 403);
    const g = await staffWith(["content.gallery"], "g@test.np");
    assert.equal((await api.post("/content/partners", g.auth, { name: "X", image: await logo() })).status, 403, "gallery rights are not enough");
    const p = await staffWith(["content.partners"], "p@test.np");
    assert.equal((await api.post("/content/partners", p.auth, { name: "Mine", image: await logo() })).status, 201);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "partner", action: "create" } })) >= 1);
    assert.equal((await request(app).post("/api/admin/content/partners").send({ name: "x", image: await logo() })).status, 401);
  });
});
