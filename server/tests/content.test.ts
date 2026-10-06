import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import sharp from "sharp";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";
import { adStatus, isLive } from "../src/modules/content";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const img = async (w: number, h: number, type: "png" | "jpeg" = "png") => {
  // noisy pixels so the picture is big enough to prove large uploads work
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 256;
  const buf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })[type]().toBuffer();
  return `data:image/${type};base64,${buf.toString("base64")}`;
};
const goodAd = async (over: object = {}) => ({ title: "Coca-Cola morning", placement: "header", image: await img(600, 120), ...over });

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

// Nepal is UTC+5:45; 2026-10-06 is a Tuesday
const at = (hhmm: string, day = "2026-10-06") => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m - 345) * 60000);
};
const sched = { active: true, startDate: null, endDate: null, dailyStart: null, dailyEnd: null, days: [] as number[] };

describe("Site Content: when an ad is live", () => {
  it("matches the customer backend: 6:00 to 7:00 AM, dates, weekdays, past midnight", () => {
    const coke = { ...sched, dailyStart: "06:00", dailyEnd: "07:00" };
    assert.equal(isLive(coke, at("05:59")), false);
    assert.equal(isLive(coke, at("06:00")), true);
    assert.equal(isLive(coke, at("06:59")), true);
    assert.equal(isLive(coke, at("07:00")), false);
    assert.equal(isLive({ ...sched, dailyStart: "22:00", dailyEnd: "02:00" }, at("01:00")), true);
    assert.equal(isLive({ ...sched, days: [2] }, at("12:00")), true);
    assert.equal(isLive({ ...sched, days: [0] }, at("12:00")), false);
    assert.equal(isLive({ ...sched, active: false }, at("12:00")), false);
  });

  it("explains why an ad is not showing", () => {
    assert.equal(adStatus({ ...sched, active: false }, at("12:00")), "paused");
    assert.equal(adStatus({ ...sched, startDate: "2026-10-10" }, at("12:00")), "scheduled");
    assert.equal(adStatus({ ...sched, endDate: "2026-10-01" }, at("12:00")), "ended");
    assert.equal(adStatus({ ...sched, dailyStart: "06:00", dailyEnd: "07:00" }, at("12:00")), "waiting");
    assert.equal(adStatus(sched, at("12:00")), "live");
  });
});

describe("Site Content: gallery", () => {
  it("adds landscape and portrait photos (any size up to 8 MB), detects the orientation and shrinks them", async () => {
    const mgr = await staff("admin");
    const wide = await api.post("/content/gallery", mgr.auth, { title: "Match night", caption: "Final", image: await img(2400, 1200) });
    assert.equal(wide.status, 201);
    assert.equal(wide.body.data.orientation, "landscape");
    const tall = await api.post("/content/gallery", mgr.auth, { title: "Trophy", image: await img(600, 1200, "jpeg") });
    assert.equal(tall.body.data.orientation, "portrait");
    const sq = await api.post("/content/gallery", mgr.auth, { title: "Ball", image: await img(500, 500) });
    assert.equal(sq.body.data.orientation, "square");
    const m = await prisma.contentMedia.findFirst({ where: { id: wide.body.data.imageUrl.split("/").pop() } });
    assert.ok(m && m.width === 1600 && m.height === 800 && m.mime === "image/jpeg", "shrunk to 1600px and saved as JPEG");
    const list = (await api.get("/content/gallery", mgr.auth)).body.data;
    assert.deepEqual(list.map((g: { title: string }) => g.title), ["Ball", "Trophy", "Match night"], "newest first");
    assert.equal((await api.get("/content/overview", mgr.auth)).body.data.photos, 3);
  });

  it("refuses things that are not pictures, and missing titles", async () => {
    const mgr = await staff("admin");
    assert.equal((await api.post("/content/gallery", mgr.auth, { title: "x", image: "data:text/html;base64," + "A".repeat(80) })).status, 400);
    assert.equal((await api.post("/content/gallery", mgr.auth, { title: "x", image: "data:image/png;base64," + Buffer.from("not an image at all, just text pretending").toString("base64") })).status, 400);
    assert.equal((await api.post("/content/gallery", mgr.auth, { title: "", image: await img(50, 50) })).status, 400);
    assert.equal(await prisma.contentMedia.count(), 0, "nothing saved for a bad picture");
  });

  it("hides, renames, reorders and deletes (the picture goes too)", async () => {
    const mgr = await staff("admin");
    const a = (await api.post("/content/gallery", mgr.auth, { title: "A", image: await img(300, 200) })).body.data;
    const b = (await api.post("/content/gallery", mgr.auth, { title: "B", image: await img(300, 200) })).body.data;
    assert.equal((await api.patch(`/content/gallery/${a.id}`, mgr.auth, { visible: false, title: "A2", caption: "hello" })).body.data.visible, false);
    assert.equal((await api.post("/content/gallery/reorder", mgr.auth, { ids: [a.id, b.id] })).status, 200);
    assert.deepEqual((await api.get("/content/gallery", mgr.auth)).body.data.map((g: { title: string }) => g.title), ["A2", "B"]);
    assert.equal((await api.post("/content/gallery/reorder", mgr.auth, { ids: [a.id, "nope"] })).status, 400);
    assert.equal((await api.del(`/content/gallery/${a.id}`, mgr.auth)).status, 200);
    assert.equal(await prisma.contentMedia.count(), 1);
    assert.equal((await api.del(`/content/gallery/${a.id}`, mgr.auth)).status, 404);
  });
});

describe("Site Content: ads", () => {
  it("creates a time-targeted ad: 6:00 to 7:00 AM, with dates and weekdays, and shows its status", async () => {
    const mgr = await staff("admin");
    const r = await api.post("/content/ads", mgr.auth, await goodAd({ dailyStart: "06:00", dailyEnd: "07:00", startDate: "2026-01-01", endDate: "2099-01-01", days: [3, 1, 1], linkUrl: "https://example.com/promo", priority: 5 }));
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.data.days, [1, 3]);
    assert.equal(r.body.data.dailyStart, "06:00");
    assert.equal(r.body.data.displaySeconds, 6);
    assert.ok(["live", "waiting"].includes(r.body.data.status));
    const row = await prisma.siteAd.findUnique({ where: { id: r.body.data.id } });
    assert.equal(row!.placement, "header");
    assert.equal((await api.get("/content/overview", mgr.auth)).body.data.ads, 1);
  });

  it("covers every place: header, footer, in-page and pop-up with delay, seconds and frequency", async () => {
    const mgr = await staff("admin");
    for (const placement of ["header", "footer", "inline"]) assert.equal((await api.post("/content/ads", mgr.auth, await goodAd({ placement, title: `Ad ${placement}` }))).status, 201);
    const pop = await api.post("/content/ads", mgr.auth, await goodAd({ placement: "popup", title: "Popup", popupDelaySeconds: 10, popupFrequency: "session", displaySeconds: 0 }));
    assert.equal(pop.status, 201);
    assert.deepEqual([pop.body.data.popupDelaySeconds, pop.body.data.popupFrequency, pop.body.data.displaySeconds], [10, "session", 0]);
    assert.equal((await api.post("/content/ads", mgr.auth, await goodAd({ placement: "header", displaySeconds: 0, title: "Too quick" }))).status, 400, "loop ads need at least 3 seconds");
  });

  it("checks the schedule, the link and the picture", async () => {
    const mgr = await staff("admin");
    const bad = async (over: object) => assert.equal((await api.post("/content/ads", mgr.auth, await goodAd(over))).status, 400, JSON.stringify(over));
    await bad({ dailyStart: "06:00" });
    await bad({ dailyStart: "06:00", dailyEnd: "06:00" });
    await bad({ dailyStart: "25:00", dailyEnd: "26:00" });
    await bad({ startDate: "2026-10-10", endDate: "2026-10-01" });
    await bad({ linkUrl: "javascript:alert(1)" });
    await bad({ linkUrl: "http://insecure.example.com" });
    await bad({ placement: "sidebar" });
    await bad({ days: [7] });
    await bad({ title: "x" });
    await bad({ image: "not a picture" });
    assert.equal((await api.post("/content/ads", mgr.auth, await goodAd({ linkUrl: "/book" }))).status, 201, "in-app link is fine");
    assert.equal(await prisma.siteAd.count(), 1);
  });

  it("pauses, edits the schedule, replaces the picture (the old one is removed) and deletes", async () => {
    const mgr = await staff("admin");
    const a = (await api.post("/content/ads", mgr.auth, await goodAd())).body.data;
    const before = await prisma.siteAd.findUnique({ where: { id: a.id } });
    const p = await api.patch(`/content/ads/${a.id}`, mgr.auth, { active: false });
    assert.equal(p.body.data.status, "paused");
    const e = await api.patch(`/content/ads/${a.id}`, mgr.auth, { active: true, dailyStart: "18:00", dailyEnd: "19:00", image: await img(800, 200) });
    assert.equal(e.status, 200);
    const after = await prisma.siteAd.findUnique({ where: { id: a.id } });
    assert.notEqual(after!.mediaId, before!.mediaId);
    assert.equal(await prisma.contentMedia.count({ where: { id: before!.mediaId } }), 0, "old picture removed");
    assert.equal((await api.patch(`/content/ads/${a.id}`, mgr.auth, { dailyEnd: null })).status, 400, "only one end of the window");
    assert.equal((await api.patch(`/content/ads/${a.id}`, mgr.auth, { dailyStart: null, dailyEnd: null })).body.data.dailyStart, null, "back to all day");
    assert.equal((await api.del(`/content/ads/${a.id}`, mgr.auth)).status, 200);
    assert.equal(await prisma.contentMedia.count(), 0);
    assert.equal((await api.patch(`/content/ads/${a.id}`, mgr.auth, { active: true })).status, 404);
  });
});

describe("Site Content: who may do what", () => {
  it("viewing, gallery and ads are separate ticks, and every change is audited", async () => {
    const owner = await staff("owner");
    const cat = (await api.get("/staff/catalog", owner.auth)).body.data;
    for (const k of ["content.view", "content.gallery", "content.ads"]) assert.ok(cat.assignable.includes(k), k);
    const v = await staffWith(["content.view"], "v@test.np");
    assert.equal((await api.get("/content/ads", v.auth)).status, 200);
    assert.equal((await api.post("/content/ads", v.auth, await goodAd())).status, 403);
    assert.equal((await api.post("/content/gallery", v.auth, { title: "x", image: await img(50, 50) })).status, 403);
    assert.equal((await api.get("/content/gallery", (await staffWith([], "n@test.np")).auth)).status, 403);
    const g = await staffWith(["content.gallery"], "g@test.np");
    assert.equal((await api.post("/content/gallery", g.auth, { title: "Mine", image: await img(50, 50) })).status, 201);
    assert.equal((await api.post("/content/ads", g.auth, await goodAd())).status, 403);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "gallery", action: "create" } })) >= 1);
    assert.equal((await request(app).post("/api/admin/content/gallery").send({ title: "x", image: await img(50, 50) })).status, 401, "signed-out visitors cannot upload");
  });
});
