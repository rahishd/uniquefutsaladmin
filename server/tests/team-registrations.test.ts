import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

async function staffWith(perms: string[], email: string) {
  await prisma.staffUser.create({ data: { email, name: "Limited", role: "staff", permissions: perms, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

async function setup(maxTeams = 2) {
  const t = await prisma.tournament.create({ data: { name: "Dashain Cup", prizePool: 0, minTeams: 2, maxTeams, startDate: "2099-01-10", endDate: "2099-01-12" } });
  const mk = (n: number, status = "pending") =>
    prisma.registration.create({ data: { tournamentId: t.id, teamName: `Team ${n}`, captainName: `Captain ${n}`, contactPhone: `98000000${n}0`, contactEmail: "", players: JSON.stringify(["A", "B", "C", "D", "E"]), status } });
  return { t, mk };
}

describe("Tournament team registrations", () => {
  it("lists the teams that signed up from the link, with their players", async () => {
    const mgr = await staff("admin");
    const { t, mk } = await setup();
    await mk(1);
    await mk(2, "approved");
    const r = await api.get(`/tournaments/${t.id}/registrations`, mgr.auth);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.items.length, 2);
    assert.equal(r.body.data.maxTeams, 2);
    assert.deepEqual(r.body.data.items[0].players, ["A", "B", "C", "D", "E"]);
    assert.equal((await api.get("/tournaments/nope/registrations", mgr.auth)).status, 404);
  });

  it("approves and rejects, tells the captain if they have an account, and audits it", async () => {
    const mgr = await staff("admin");
    const { t, mk } = await setup(8);
    const reg = await mk(1);
    await prisma.user.create({ data: { phoneNumber: reg.contactPhone, name: "Captain 1", password: await bcrypt.hash("x", 4), isVerified: true, role: "user" } });
    const ok = await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, mgr.auth, { status: "approved" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, "approved");
    const n = await prisma.notification.findMany({ where: { userId: reg.contactPhone } });
    assert.equal(n.length, 1);
    assert.match(n[0].title, /confirmed/i);
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, mgr.auth, { status: "rejected" })).body.data.status, "rejected");
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, mgr.auth, { status: "banana" })).status, 400);
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/nope`, mgr.auth, { status: "approved" })).status, 404);
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "team-registration" } })) >= 2);
  });

  it("will not bring a rejected team back when every place is taken", async () => {
    const mgr = await staff("admin");
    const { t, mk } = await setup(2);
    const out = await mk(1, "rejected");
    await mk(2);
    await mk(3, "approved");
    const r = await api.patch(`/tournaments/${t.id}/registrations/${out.id}`, mgr.auth, { status: "pending" });
    assert.equal(r.status, 409);
  });

  it("needs its own permission to decide, and view access to look", async () => {
    const { t, mk } = await setup();
    const reg = await mk(1);
    const viewer = await staffWith(["tournaments.view"], "v@test.np");
    assert.equal((await api.get(`/tournaments/${t.id}/registrations`, viewer.auth)).status, 200);
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, viewer.auth, { status: "approved" })).status, 403);
    const editor = await staffWith(["tournaments.view", "tournaments.edit"], "e@test.np");
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, editor.auth, { status: "approved" })).status, 403, "editing the tie-sheet is not enough");
    const decider = await staffWith(["tournaments.registrations"], "d@test.np");
    assert.equal((await api.patch(`/tournaments/${t.id}/registrations/${reg.id}`, decider.auth, { status: "approved" })).status, 200);
    assert.equal((await request(app).get(`/api/admin/tournaments/${t.id}/registrations`)).status, 401);
  });
  it("the host sets the entry fee from the host link, customers see it, and staff cannot", async () => {
    const mgr = await staff("admin");
    const { t } = await setup();
    const token = (await api.post(`/tournaments/${t.id}/host-link`, mgr.auth)).body.data.token as string;
    const put = (body: unknown, tk = token) => request(app).put(`/api/admin/host/${tk}/entry-fee`).send(body as object);
    assert.equal((await put({ entryFee: 1500 })).status, 200);
    assert.equal((await prisma.tournament.findUnique({ where: { id: t.id } }))!.entryFee, 1500);
    assert.equal((await request(app).get(`/api/admin/host/${token}`)).body.data.tournament.entryFee, 1500);
    assert.equal((await api.get(`/tournaments/${t.id}`, mgr.auth)).body.data.tournament.entryFee, 1500);
    assert.equal((await put({ entryFee: 0 })).status, 200, "0 means free entry");
    assert.equal((await put({ entryFee: -5 })).status, 400);
    assert.equal((await put({ entryFee: 99.5 })).status, 400);
    assert.equal((await put({ entryFee: 100 }, "x".repeat(32))).status, 404, "a wrong link does nothing");
    assert.equal((await api.patch(`/tournaments/${t.id}/entry-fee`, mgr.auth, { entryFee: 10 })).status, 404, "staff no longer set the fee");
    assert.ok((await prisma.adminAuditLog.count({ where: { entity: "tournament", action: "entry-fee" } })) >= 2);
  });
  it("the host sets the most teams, 0 means no limit, and it cannot go below the teams already in", async () => {
    const mgr = await staff("admin");
    const { t, mk } = await setup(0);
    await mk(1); await mk(2); await mk(3);
    const token = (await api.post(`/tournaments/${t.id}/host-link`, mgr.auth)).body.data.token as string;
    const put = (body: unknown, tk = token) => request(app).put(`/api/admin/host/${tk}/max-teams`).send(body as object);
    assert.equal((await request(app).get(`/api/admin/host/${token}`)).body.data.tournament.maxTeams, 0);
    assert.equal((await put({ maxTeams: 2 })).status, 409, "3 teams are already in");
    assert.equal((await put({ maxTeams: 3 })).status, 200);
    assert.equal((await prisma.tournament.findUnique({ where: { id: t.id } }))!.maxTeams, 3);
    assert.equal((await put({ maxTeams: 0 })).status, 200, "0 means no limit");
    assert.equal((await put({ maxTeams: -1 })).status, 400);
    assert.equal((await put({ maxTeams: 5 }, "x".repeat(32))).status, 404);
  });
});
