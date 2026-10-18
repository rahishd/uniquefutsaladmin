import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const FILER = "9880000011";
const PATIENT = "9880000012";

// witnessNameNe is plain text here: the admin side does not check it, and a local test database may not be UTF-8.
const claim = (extra: object = {}) =>
  prisma.insuranceClaim.create({
    data: {
      code: `IC-T${Math.random().toString(36).slice(2, 7).toUpperCase()}`, userId: FILER, patientName: "Injured Ina", patientPhone: PATIENT,
      witnessName: "Ram Thapa", witnessNameNe: "Ram Thapa (ne)", severity: "minor", incidentDate: today, photos: ["/uploads/insurance/x.jpg"], ...extra,
    },
  });

describe("Insurance claims (admin)", () => {
  it("lists claims with emergencies first, the filer's name and the patient's emergency contact, and gives tab counts", async () => {
    const owner = await staff("owner");
    await customer(FILER, "Filer Fulmaya");
    await customer(PATIENT, "Injured Ina");
    await prisma.user.update({ where: { phoneNumber: PATIENT }, data: { emergencyName: "Mother Maya", emergencyPhone: "9811110012", emergencyRelation: "Mother" } });
    await claim();
    await claim({ severity: "emergency", status: "in_review" });
    const all = (await api.get("/insurance", owner.auth)).body.data;
    assert.equal(all.total, 2);
    assert.equal(all.items[0].severity, "emergency");
    assert.equal(all.items[0].filerName, "Filer Fulmaya");
    assert.deepEqual(all.items[0].emergency, { name: "Mother Maya", phone: "9811110012", relation: "Mother" });
    assert.equal((await api.get("/insurance?status=in_review", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/insurance?severity=emergency", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/insurance?q=ina", owner.auth)).body.data.total, 2);
    const counts = (await api.get("/insurance/counts", owner.auth)).body.data;
    assert.deepEqual([counts.all, counts.submitted, counts.in_review], [2, 1, 1]);
  });

  it("approves with a reply and tells both the filer and the injured player", async () => {
    const owner = await staff("owner");
    await customer(FILER, "Filer Fulmaya");
    await customer(PATIENT, "Injured Ina");
    const c = await claim();
    const res = await api.patch(`/insurance/${c.id}`, owner.auth, { status: "approved", reply: "Approved. Bring the hospital bill." });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "approved");
    assert.ok(res.body.data.decidedAt);
    for (const who of [FILER, PATIENT]) {
      const n = await prisma.notification.findFirstOrThrow({ where: { userId: who, type: "insurance" } });
      assert.match(n.message, /hospital bill/);
      assert.equal(n.href, "/insurance");
    }
    assert.ok(await prisma.adminAuditLog.findFirst({ where: { entity: "insurance", entityId: c.id } }));
    // saving the same thing again sends nothing new
    await api.patch(`/insurance/${c.id}`, owner.auth, { status: "approved", reply: "Approved. Bring the hospital bill." });
    assert.equal(await prisma.notification.count({ where: { userId: FILER, type: "insurance" } }), 1);
  });

  it("asks for a status or a reply and finds a claim by its code", async () => {
    const owner = await staff("owner");
    const c = await claim();
    assert.equal((await api.patch(`/insurance/${c.id}`, owner.auth, {})).status, 400);
    assert.equal((await api.patch(`/insurance/${c.id}`, owner.auth, { status: "paid" })).status, 400);
    assert.equal((await api.get(`/insurance/${c.code}`, owner.auth)).body.data.id, c.id);
    assert.equal((await api.get("/insurance/nothing-here", owner.auth)).status, 404);
  });

  it("needs the insurance permissions", async () => {
    const c = await claim();
    const viewer = await staff("staff", "viewer@test.np");
    await prisma.staffUser.update({ where: { id: viewer.id }, data: { permissions: ["insurance.view"] } });
    assert.equal((await api.get("/insurance", viewer.auth)).status, 200);
    assert.equal((await api.patch(`/insurance/${c.id}`, viewer.auth, { status: "approved" })).status, 403);
    const none = await staff("staff", "none@test.np");
    await prisma.staffUser.update({ where: { id: none.id }, data: { permissions: [] } });
    assert.equal((await api.get("/insurance", none.auth)).status, 403);
  });
});
