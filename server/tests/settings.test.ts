import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const venue = { name: "Unique Futsal", phone: "9811940018", whatsapp: "https://wa.me/9779811940018", email: "info.uniquefutsal@gmail.com", address: "Manigram Tilottama-05, Rupandehi, Nepal", facebook: "", tiktok: "", mapEmbed: "https://www.google.com/maps?q=Unique+Futsal+Tilottama+Rupandehi+Nepal&output=embed" };

describe("Settings page", () => {
  it("shows the venue defaults, Wi-Fi, deposit and integration status without any secret", async () => {
    const owner = await staff("owner");
    const r = (await api.get("/settings", owner.auth)).body.data;
    assert.equal(r.venue.name, "Unique Futsal");
    assert.equal(r.booking.advanceDeposit, 0);
    assert.equal(r.integrations.fonepay.mode, "test");
    assert.equal(r.integrations.database, true);
    assert.equal(r.canEdit, true);
    assert.equal(JSON.stringify(r).includes("FONEPAY_SECRET"), false);
  });

  it("saves venue details in the key the customer app reads, and audits only what changed", async () => {
    const owner = await staff("owner");
    const ok = await api.put("/settings/venue", owner.auth, { ...venue, phone: "9800000000", facebook: "https://facebook.com/uniquefutsal" });
    assert.equal(ok.status, 200);
    const stored = JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "siteInfo" } })).value);
    assert.equal(stored.phone, "9800000000");
    assert.equal((await api.get("/settings", owner.auth)).body.data.venue.facebook, "https://facebook.com/uniquefutsal");
    const log = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "update-venue" } });
    assert.deepEqual(JSON.parse(log.details!).changed.sort(), ["facebook", "phone"]);
  });

  it("refuses bad venue details", async () => {
    const owner = await staff("owner");
    for (const bad of [{ phone: "abc" }, { email: "nope" }, { name: "" }, { whatsapp: "http://wa.me/1" }, { whatsapp: "https://example.com/x" }, { facebook: "javascript:alert(1)" }, { mapEmbed: "ftp://x" }]) {
      assert.equal((await api.put("/settings/venue", owner.auth, { ...venue, ...bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal(await prisma.settings.count({ where: { key: "siteInfo" } }), 0);
  });

  it("saves Wi-Fi and never writes the password to the audit log", async () => {
    const owner = await staff("owner");
    assert.equal((await api.put("/settings/wifi", owner.auth, { ssid: "", password: "x" })).status, 400);
    assert.equal((await api.put("/settings/wifi", owner.auth, { ssid: "Unique-Guest", password: "goal-2026-pass" })).status, 200);
    assert.equal((await prisma.settings.findUniqueOrThrow({ where: { key: "wifiPassword" } })).value, "goal-2026-pass");
    const logs = JSON.stringify(await prisma.adminAuditLog.findMany());
    assert.equal(logs.includes("goal-2026-pass"), false);
    assert.equal((await api.get("/settings", owner.auth)).body.data.wifi.password, "goal-2026-pass");
  });

  it("saves the booking deposit as whole rupees within range", async () => {
    const owner = await staff("owner");
    assert.equal((await api.put("/settings/booking", owner.auth, { advanceDeposit: 500 })).status, 200);
    assert.equal((await prisma.settings.findUniqueOrThrow({ where: { key: "advanceDeposit" } })).value, "500");
    for (const bad of [-1, 12.5, 1_000_000]) assert.equal((await api.put("/settings/booking", owner.auth, { advanceDeposit: bad })).status, 400);
    assert.equal((await api.get("/settings", owner.auth)).body.data.booking.advanceDeposit, 500);
  });

  it("is limited: front desk cannot open it, a viewer sees it but cannot change it and does not see the Wi-Fi password", async () => {
    const owner = await staff("owner");
    await api.put("/settings/wifi", owner.auth, { ssid: "Unique-Guest", password: "goal-2026-pass" });
    const desk = await staff("frontdesk");
    assert.equal((await api.get("/settings", desk.auth)).status, 403);
    assert.equal((await api.get("/settings", {})).status, 401);
    await prisma.staffUser.create({ data: { email: "v@test.np", name: "Viewer", role: "staff", permissions: ["settings.view"], passwordHash: await bcrypt.hash(PASSWORD, 4) } });
    const login = await request(app).post("/api/admin/auth/login").send({ email: "v@test.np", password: PASSWORD });
    const auth = { Authorization: `Bearer ${login.body.data.token}` };
    const seen = (await api.get("/settings", auth)).body.data;
    assert.equal(seen.canEdit, false);
    assert.equal(seen.wifi.password, "(set)");
    assert.equal((await api.put("/settings/booking", auth, { advanceDeposit: 100 })).status, 403);
    assert.equal((await api.put("/settings/venue", auth, venue)).status, 403);
  });
});
