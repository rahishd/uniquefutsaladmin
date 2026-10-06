import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { addDaysKey, api, customer, prisma, reset, staff, todayKey } from "./helpers";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app, PASSWORD } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const D = (n: number) => addDaysKey(todayKey(), n);
const cls = { date: D(3), startTime: "07:00", endTime: "08:30", capacity: 2, visible: true };

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

async function enrol(sessionId: string, userId: string, name: string, over: object = {}) {
  return prisma.academyEnrollment.create({
    data: { code: `AC-${name.slice(0, 3).toUpperCase()}${userId.slice(-3)}`, sessionId, userId, guardianName: "G", guardianPhone: userId, emergencyPhone: "9841000002", address: "Kathmandu", childName: name, childKey: name.toLowerCase(), childAge: 12, healthStatus: "healthy", termsVersion: 1, termsAcceptedAt: new Date(), ...over },
  });
}

describe("Children's Academy (admin)", () => {
  it("adds classes, rejects bad times, and can repeat weekly", async () => {
    const mgr = await staff("admin");
    const one = await api.post("/academy/sessions", mgr.auth, cls);
    assert.equal(one.status, 201);
    assert.equal(one.body.data[0].seatsLeft, 2);
    assert.equal((await api.post("/academy/sessions", mgr.auth, cls)).status, 409, "same start time twice");
    assert.equal((await api.post("/academy/sessions", mgr.auth, { ...cls, startTime: "09:00", endTime: "08:00" })).status, 400);
    assert.equal((await api.post("/academy/sessions", mgr.auth, { ...cls, date: D(-2), startTime: "10:00", endTime: "11:00" })).status, 400);
    assert.equal((await api.post("/academy/sessions", mgr.auth, { ...cls, startTime: "10:00", endTime: "11:00", capacity: 0 })).status, 400);
    const rep = await api.post("/academy/sessions", mgr.auth, { ...cls, startTime: "16:00", endTime: "17:00", repeatWeeks: 3 });
    assert.equal(rep.body.data.length, 4);
    assert.deepEqual(rep.body.data.map((s: { date: string }) => s.date), [0, 7, 14, 21].map((n) => D(3 + n)));
    const list = await api.get("/academy/sessions", mgr.auth);
    assert.equal(list.body.data.length, 5);
    assert.equal((await api.get("/academy/overview", mgr.auth)).body.data.upcomingClasses, 5);
  });

  it("shows and hides a class from guardians, and guards the time and capacity once children are enrolled", async () => {
    const mgr = await staff("admin");
    const s = (await api.post("/academy/sessions", mgr.auth, { ...cls, visible: false })).body.data[0];
    assert.equal(s.visible, false);
    assert.equal((await api.patch(`/academy/sessions/${s.id}`, mgr.auth, { visible: true, coach: "Coach Ram" })).body.data.visible, true);
    await customer("9860000001", "Parent One");
    await enrol(s.id, "9860000001", "Aarav");
    await enrol(s.id, "9860000001", "Binita");
    assert.equal((await api.patch(`/academy/sessions/${s.id}`, mgr.auth, { startTime: "08:00", endTime: "09:30" })).status, 409);
    assert.equal((await api.patch(`/academy/sessions/${s.id}`, mgr.auth, { capacity: 1 })).status, 409);
    assert.equal((await api.patch(`/academy/sessions/${s.id}`, mgr.auth, { capacity: 20 })).status, 200);
    const row = (await api.get("/academy/sessions", mgr.auth)).body.data.find((x: { id: string }) => x.id === s.id);
    assert.equal(row.enrolled, 2);
    assert.equal(row.seatsLeft, 18);
  });

  it("cancelling a class cancels the enrolments and tells every guardian", async () => {
    const mgr = await staff("admin");
    const s = (await api.post("/academy/sessions", mgr.auth, cls)).body.data[0];
    await customer("9860000002", "Parent Two");
    const e = await enrol(s.id, "9860000002", "Chirag");
    const r = await api.post(`/academy/sessions/${s.id}/cancel`, mgr.auth, { reason: "Rain" });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.cancelledEnrollments, 1);
    assert.equal((await prisma.academyEnrollment.findUnique({ where: { id: e.id } }))!.status, "cancelled");
    const note = await prisma.notification.findFirst({ where: { userId: "9860000002", type: "academy" } });
    assert.ok(note && /Rain/.test(note.message));
    assert.equal((await api.post(`/academy/sessions/${s.id}/cancel`, mgr.auth)).status, 409);
    assert.equal((await api.patch(`/academy/sessions/${s.id}`, mgr.auth, { visible: true })).status, 409);
  });

  it("lists enrolled children with guardian, emergency contact and health notes, with filters", async () => {
    const mgr = await staff("admin");
    const s = (await api.post("/academy/sessions", mgr.auth, cls)).body.data[0];
    await customer("9860000003", "Parent Three");
    await enrol(s.id, "9860000003", "Dipesh", { healthStatus: "condition", healthNotes: "Asthma" });
    await enrol(s.id, "9860000003", "Esha");
    const all = (await api.get(`/academy/enrollments?sessionId=${s.id}`, mgr.auth)).body.data;
    assert.equal(all.total, 2);
    assert.equal(all.items[0].emergencyPhone, "9841000002");
    const sick = (await api.get("/academy/enrollments?health=condition", mgr.auth)).body.data;
    assert.equal(sick.total, 1);
    assert.equal(sick.items[0].healthNotes, "Asthma");
    assert.equal((await api.get("/academy/enrollments?q=esha", mgr.auth)).body.data.total, 1);
  });

  it("marks attendance only after the class starts, and cancels one enrolment with a notice", async () => {
    const mgr = await staff("admin");
    const future = (await api.post("/academy/sessions", mgr.auth, cls)).body.data[0];
    const past = await prisma.academySession.create({ data: { date: D(-1), startTime: "07:00", endTime: "08:00", capacity: 5, createdBy: "t" } });
    await customer("9860000004", "Parent Four");
    const f = await enrol(future.id, "9860000004", "Farhan");
    const p = await enrol(past.id, "9860000004", "Gita");
    assert.equal((await api.post(`/academy/enrollments/${f.id}/attendance`, mgr.auth, { status: "attended" })).status, 409);
    assert.equal((await api.post(`/academy/enrollments/${p.id}/attendance`, mgr.auth, { status: "attended" })).body.data.status, "attended");
    assert.equal((await api.post(`/academy/enrollments/${p.id}/attendance`, mgr.auth, { status: "no_show" })).body.data.status, "no_show");
    assert.equal((await api.post(`/academy/enrollments/${f.id}/cancel`, mgr.auth)).status, 200);
    assert.equal((await api.post(`/academy/enrollments/${f.id}/cancel`, mgr.auth)).status, 409);
    assert.equal((await api.post(`/academy/enrollments/${f.id}/attendance`, mgr.auth, { status: "attended" })).status, 409);
    assert.equal(await prisma.notification.count({ where: { userId: "9860000004", type: "academy" } }), 1);
  });

  it("edits the terms, raising the version and keeping the old text", async () => {
    const mgr = await staff("admin");
    const first = (await api.get("/academy/terms", mgr.auth)).body.data;
    assert.equal(first.version, 1);
    assert.match(first.text, /aged 10 to 14/);
    assert.equal((await api.put("/academy/terms", mgr.auth, { text: "short" })).status, 400);
    const saved = await api.put("/academy/terms", mgr.auth, { text: "New rules: arrive early, bring water, and wear shin guards." });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.version, 2);
    assert.equal(saved.body.data.history[0].version, 1);
    assert.equal((await api.put("/academy/terms", mgr.auth, { text: "New rules: arrive early, bring water, and wear shin guards." })).status, 409, "unchanged");
    const stored = JSON.parse((await prisma.settings.findUnique({ where: { key: "academyTerms" } }))!.value);
    assert.equal(stored.version, 2, "the customer app reads this same row");
  });

  it("small permissions: viewing is separate from adding classes, attendance and terms", async () => {
    const owner = await staff("owner");
    const cat = (await api.get("/staff/catalog", owner.auth)).body.data;
    for (const k of ["academy.view", "academy.sessions", "academy.enrollments", "academy.terms"]) assert.ok(cat.assignable.includes(k), k);
    const v = await staffWith(["academy.view"], "v@test.np");
    assert.equal((await api.get("/academy/sessions", v.auth)).status, 200);
    assert.equal((await api.post("/academy/sessions", v.auth, cls)).status, 403);
    assert.equal((await api.put("/academy/terms", v.auth, { text: "Some new terms for the academy." })).status, 403);
    const n = await staffWith([], "n@test.np");
    assert.equal((await api.get("/academy/sessions", n.auth)).status, 403);
    const t = await staffWith(["academy.terms"], "t@test.np");
    assert.equal((await api.put("/academy/terms", t.auth, { text: "Some new terms for the academy." })).status, 200);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "academy_terms" } })) >= 1);
  });
});
