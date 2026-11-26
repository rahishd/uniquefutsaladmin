import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, PASSWORD, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const hosted = (phone: string | null = "9811223344") =>
  prisma.tournament.create({ data: { name: "Host Cup", prizePool: 0, minTeams: 2, maxTeams: 0, startDate: "2099-01-10", endDate: "2099-01-12", hostedEvent: true, hostName: "Anil Gurung", hostPhone: phone, minRate: 2000 } as never });
const signIn = (id: string, password: string) => request(app).post("/api/admin/auth/organizer-login").send({ id, password });

describe("Host login: ID = contact number, PIN = 4 digits set by staff", () => {
  it("is made from the tournament, signs in with the number and PIN, and holds every tournament of that number", async () => {
    const owner = await staff("owner");
    const t = await hosted();
    const second = await hosted("98112 23344"); // the same number written another way
    const before = (await api.get(`/tournaments/${t.id}/host-login`, owner.auth)).body.data;
    assert.equal(before.available, true);
    assert.equal(before.phone, "9811223344");
    assert.equal(before.account.exists, false);

    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "12" })).status, 400, "4 digits only");
    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "12ab" })).status, 400);
    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "4821" })).status, 201);

    const ok = await signIn("9811223344", "4821");
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.token);
    assert.equal((await signIn("9811223344", "1111")).status, 401);
    const acc = await prisma.staffUser.findUnique({ where: { email: "9811223344" } });
    assert.equal(acc?.role, "organizer");
    assert.equal(await prisma.tournamentOrganizer.count({ where: { staffId: acc!.id } }), 2, "both tournaments of that number");
    assert.ok(second.id);
    assert.equal((await prisma.adminAuditLog.findFirst({ where: { action: "host-login-set" } }))?.details?.includes("4821"), false, "the PIN is never logged");

    // a new PIN: the old one stops at once
    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "9035" })).status, 201);
    assert.equal((await signIn("9811223344", "4821")).status, 401);
    assert.equal((await signIn("9811223344", "9035")).status, 200);
    assert.equal((await api.get(`/tournaments/${t.id}/host-login`, owner.auth)).body.data.account.tournaments, 2);
  });

  it("locks after 5 wrong tries, and can be switched off", async () => {
    const owner = await staff("owner");
    const t = await hosted();
    await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "2468" });
    for (let i = 0; i < 5; i++) assert.equal((await signIn("9811223344", "0000")).status, 401);
    assert.equal((await signIn("9811223344", "2468")).status, 429, "locked even with the right PIN");

    await prisma.adminAuditLog.deleteMany({ where: { action: "organizer-login-failed" } }); // the 15 minutes have passed
    assert.equal((await signIn("9811223344", "2468")).status, 200);
    assert.equal((await api.del(`/tournaments/${t.id}/host-login`, owner.auth)).status, 200);
    assert.equal((await signIn("9811223344", "2468")).status, 401, "switched off");
  });

  it("needs a host contact number, its own permission, and does not take a portal staff address", async () => {
    const owner = await staff("owner");
    const none = await hosted(null);
    assert.equal((await api.get(`/tournaments/${none.id}/host-login`, owner.auth)).body.data.available, false);
    assert.equal((await api.put(`/tournaments/${none.id}/host-login`, owner.auth, { pin: "1234" })).status, 409);

    const t = await hosted();
    await prisma.staffUser.create({ data: { email: "9811223344", name: "Portal staff", role: "staff", permissions: [], passwordHash: await bcrypt.hash(PASSWORD, 4) } });
    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "1234" })).status, 409, "that ID belongs to another account");

    await prisma.staffUser.create({ data: { email: "viewer@test.np", name: "Viewer", role: "staff", permissions: ["tournaments.view"], passwordHash: await bcrypt.hash(PASSWORD, 4) } });
    const login = await request(app).post("/api/admin/auth/login").send({ email: "viewer@test.np", password: PASSWORD });
    const viewer = { Authorization: `Bearer ${login.body.data.token}` };
    assert.equal((await api.put(`/tournaments/${t.id}/host-login`, viewer, { pin: "1234" })).status, 403);
  });

  it("sends the details by SMS only for the PIN that is really set, without keeping the PIN in the log", async () => {
    const owner = await staff("owner");
    const t = await hosted();
    await api.put(`/tournaments/${t.id}/host-login`, owner.auth, { pin: "7391" });
    const saved = { fetch: globalThis.fetch, p: process.env.SMS_PROVIDER, u: process.env.SMSGATE_USERNAME, w: process.env.SMSGATE_PASSWORD };
    process.env.SMS_PROVIDER = "android"; process.env.SMSGATE_USERNAME = "u"; process.env.SMSGATE_PASSWORD = "p";
    let text = "";
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => { text = JSON.parse(init?.body ?? "{}").textMessage?.text ?? ""; return new Response(JSON.stringify({ id: "x" }), { status: 202 }); }) as typeof fetch;
    try {
      assert.equal((await api.post(`/tournaments/${t.id}/host-login/sms`, owner.auth, { pin: "0000", url: "https://admin.example.np" })).status, 409, "not the PIN that is set");
      const r = await api.post(`/tournaments/${t.id}/host-login/sms`, owner.auth, { pin: "7391", url: "https://admin.example.np" });
      assert.equal(r.status, 200);
      assert.ok(text.includes("9811223344") && text.includes("7391") && text.includes("admin.example.np/organizer") && text.split(/\s+/).length < 30);
      const log = await prisma.smsLog.findFirst({ where: { phoneNumber: "9811223344" } });
      assert.ok(log && !log.message.includes("7391"));
    } finally {
      globalThis.fetch = saved.fetch;
      for (const [k, v] of [["SMS_PROVIDER", saved.p], ["SMSGATE_USERNAME", saved.u], ["SMSGATE_PASSWORD", saved.w]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
});
