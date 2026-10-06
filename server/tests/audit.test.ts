import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const row = (staffId: string, staffName: string, action: string, entity: string, extra: object = {}) =>
  prisma.adminAuditLog.create({ data: { staffId, staffName, action, entity, ...extra } });

describe("Audit log", () => {
  it("filters by staff, action, entity, date range and search words, newest first", async () => {
    const owner = await staff("owner");
    await prisma.adminAuditLog.deleteMany(); // signing in writes a row of its own
    await row("s1", "Nima Sherpa", "walk-in", "booking", { entityId: "UF-AAA111", details: JSON.stringify({ team: "Tuna FC", total: 1500 }), createdAt: new Date(Date.now() - 3 * 86_400_000) });
    await row("s2", "Rita Rai", "cancel", "booking", { entityId: "UF-BBB222", details: JSON.stringify({ reason: "rain" }) });
    await row("s2", "Rita Rai", "create", "membership", { entityId: "MEM-1" });

    const all = await api.get("/audit", owner.auth);
    assert.equal(all.body.data.total, 3);
    assert.equal(all.body.data.items[0].action === "walk-in", false, "newest first");
    assert.equal((await api.get("/audit?staffId=s2", owner.auth)).body.data.total, 2);
    assert.equal((await api.get("/audit?entity=booking&action=cancel", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/audit?q=tuna", owner.auth)).body.data.total, 1, "words in the details");
    assert.equal((await api.get("/audit?q=uf-bbb", owner.auth)).body.data.total, 1, "record id, any case");
    assert.equal((await api.get("/audit?q=rita", owner.auth)).body.data.total, 2, "staff name");
    assert.equal((await api.get(`/audit?from=${today}&to=${today}`, owner.auth)).body.data.total, 2, "only today");
    assert.equal((await api.get(`/audit?from=${addDaysKey(today, -5)}&to=${addDaysKey(today, -2)}`, owner.auth)).body.data.total, 1);
    assert.equal((await api.get(`/audit?from=${today}&to=${addDaysKey(today, -1)}`, owner.auth)).status, 400);
    assert.equal((await api.get("/audit?from=yesterday", owner.auth)).status, 400);
  });

  it("lists what can be filtered with counts, and a summary", async () => {
    const owner = await staff("owner");
    await prisma.adminAuditLog.deleteMany(); // signing in writes a row of its own
    await row("s1", "Nima Sherpa", "cancel", "booking");
    await row("s1", "Nima Sherpa", "cancel", "booking");
    await row("s2", "Rita Rai", "create", "membership", { createdAt: new Date(Date.now() - 10 * 86_400_000) });
    const f = (await api.get("/audit/filters", owner.auth)).body.data;
    assert.deepEqual(f.entities, [{ name: "booking", count: 2 }, { name: "membership", count: 1 }]);
    assert.deepEqual(f.actions.find((a: { name: string }) => a.name === "cancel"), { name: "cancel", count: 2 });
    assert.equal(f.staff.find((s: { id: string }) => s.id === "s1").count, 2);
    assert.equal(f.summary.total >= 3, true);
    assert.equal(f.summary.today >= 2, true);
    assert.equal(f.summary.week < f.summary.total, true, "the old row is outside the week");
  });

  it("needs the audit permission", async () => {
    const desk = await staff("frontdesk");
    assert.equal((await api.get("/audit", desk.auth)).status, 403);
    assert.equal((await api.get("/audit/filters", desk.auth)).status, 403);
    assert.equal((await api.get("/audit", {})).status, 401);
  });
});
