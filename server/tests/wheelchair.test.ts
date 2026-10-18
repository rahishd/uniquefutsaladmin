import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff, todayKey } from "./helpers";

const today = todayKey();
before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const request = (extra: object = {}) =>
  prisma.wheelchairRequest.create({ data: { code: `WC-T${Math.random().toString(36).slice(2, 7).toUpperCase()}`, userId: "9880000001", date: today, time: "18:00", people: 2, note: "Need a ramp", ...extra } });

describe("Wheelchair requests (admin)", () => {
  it("lists requests with the customer's name, filters by status and gives tab counts", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    await request();
    await request({ status: "confirmed" });
    const all = (await api.get("/wheelchair", owner.auth)).body.data;
    assert.equal(all.total, 2);
    assert.equal(all.items[0].customerName, "Raju Rai");
    assert.equal((await api.get("/wheelchair?status=confirmed", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/wheelchair?q=raju", owner.auth)).body.data.total, 2);
    const counts = (await api.get("/wheelchair/counts", owner.auth)).body.data;
    assert.deepEqual([counts.all, counts.pending, counts.confirmed], [2, 1, 1]);
  });

  it("confirms with a reply and tells the customer in the app", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    const r = await request();
    const res = await api.patch(`/wheelchair/${r.id}`, owner.auth, { status: "confirmed", reply: "Ramp is ready at the side gate." });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "confirmed");
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: "9880000001", type: "wheelchair" } });
    assert.match(n.message, /Ramp is ready/);
    assert.equal(n.href, "/wheelchair");
    assert.ok(await prisma.adminAuditLog.findFirst({ where: { entity: "wheelchair", entityId: r.id } }));
    // saving the same thing again changes nothing and sends nothing
    await api.patch(`/wheelchair/${r.id}`, owner.auth, { status: "confirmed", reply: "Ramp is ready at the side gate." });
    assert.equal(await prisma.notification.count({ where: { userId: "9880000001", type: "wheelchair" } }), 1);
  });

  it("asks for a status or a reply, and leaves a cancelled request alone", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    const r = await request();
    assert.equal((await api.patch(`/wheelchair/${r.id}`, owner.auth, {})).status, 400);
    assert.equal((await api.patch(`/wheelchair/${r.id}`, owner.auth, { status: "nonsense" })).status, 400);
    const c = await request({ status: "cancelled" });
    assert.equal((await api.patch(`/wheelchair/${c.id}`, owner.auth, { status: "confirmed" })).status, 409);
    assert.equal((await api.get("/wheelchair/nothing-here", owner.auth)).status, 404);
  });

  it("needs the wheelchair permissions", async () => {
    await customer("9880000001", "Raju Rai");
    const r = await request();
    const viewer = await staff("staff", "viewer@test.np");
    await prisma.staffUser.update({ where: { id: viewer.id }, data: { permissions: ["wheelchair.view"] } });
    assert.equal((await api.get("/wheelchair", viewer.auth)).status, 200);
    assert.equal((await api.patch(`/wheelchair/${r.id}`, viewer.auth, { status: "confirmed" })).status, 403);
    const none = await staff("staff", "none@test.np");
    assert.equal((await api.get("/wheelchair", none.auth)).status, 403);
    assert.equal((await api.get("/wheelchair", {})).status, 401);
  });

  it("shows a new request in the live feed and on the dashboard", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    const r = await request();
    const feed = (await api.get("/activity", owner.auth)).body.data.items as { type: string; title: string; text: string; ref?: string; href: string }[];
    const item = feed.find((i) => i.type === "wheelchair");
    assert.ok(item);
    assert.equal(item.title, "Wheelchair request");
    assert.match(item.text, /Raju Rai/);
    assert.equal(item.ref, `wc-${r.id}`);
    assert.equal(item.href, "/wheelchair");
    const dash = (await api.get("/dashboard", owner.auth)).body.data;
    assert.equal(dash.tasks.wheelchair, 1);
  });
});
