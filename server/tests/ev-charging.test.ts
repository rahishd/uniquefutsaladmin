import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, paidQr, prisma, reset, staff } from "./helpers";

async function wipe() {
  await prisma.$executeRawUnsafe('DELETE FROM "EvCharge"');
  await prisma.$executeRawUnsafe('DELETE FROM "EvPort"');
  await reset();
}
before(wipe);
beforeEach(wipe);
after(async () => { await wipe(); await prisma.$disconnect(); });

describe("EV charging (admin)", () => {
  it("adds a port with its own QR code, and the code can be replaced", async () => {
    const owner = await staff("owner");
    const p = await api.post("/ev-charging/ports", owner.auth, { name: "Port 1" });
    assert.equal(p.status, 201);
    const token = p.body.data.qrToken as string;
    assert.match(token, /^[A-Z0-9]{12}$/);
    const n = await api.patch(`/ev-charging/ports/${p.body.data.id}`, owner.auth, { newQr: true });
    assert.notEqual(n.body.data.qrToken, token);
  });

  it("records a walk-in charge at the hourly rate, paid now", async () => {
    const owner = await staff("owner");
    const r = await api.post("/ev-charging", owner.auth, { customerName: "Walk In", hours: 2, payment: "cash" });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.amount, 100);
    const list = (await api.get("/ev-charging", owner.auth)).body.data;
    assert.equal(list.summary.today.amount, 100);
    assert.equal(list.summary.today.cash, 100);
  });

  it("a customer session is billed when stopped and only counts as revenue once paid", async () => {
    const owner = await staff("owner");
    const port = (await api.post("/ev-charging/ports", owner.auth, { name: "Port 2" })).body.data;
    const started = new Date(Date.now() - 40 * 60 * 1000); // charging for 40 minutes
    const row = await prisma.evCharge.create({ data: { portId: port.id, userId: "9800000900", phone: "9800000900", customerName: "App User", rate: 50, amount: 0, status: "charging", source: "app", startedAt: started, createdBy: "9800000900" } });

    assert.equal((await api.get("/ev-charging/ports", owner.auth)).body.data[0].busy, true);
    const stop = await api.post(`/ev-charging/${row.id}/stop`, owner.auth);
    assert.equal(stop.status, 200);
    assert.equal(stop.body.data.status, "unpaid");
    assert.equal(stop.body.data.amount, 38); // 3 quarter hours of Rs. 12.5, rounded up
    assert.equal((await api.post(`/ev-charging/${row.id}/stop`, owner.auth)).status, 409);

    let list = (await api.get("/ev-charging", owner.auth)).body.data;
    assert.equal(list.unpaid.amount, 38);
    assert.equal(list.summary.today.amount, 0);

    // a split payment needs a paid Fonepay QR for the online part
    assert.equal((await api.post(`/ev-charging/${row.id}/pay`, owner.auth, { payments: [{ method: "cash", amount: 18 }, { method: "fonepay", amount: 20 }] })).status, 400);
    const qr = await paidQr(owner.auth, 20);
    const pay = await api.post(`/ev-charging/${row.id}/pay`, owner.auth, { payments: [{ method: "cash", amount: 18 }, { method: "fonepay", amount: 20 }], fonepayQrId: qr });
    assert.equal(pay.status, 200);
    assert.equal(pay.body.data.status, "paid");
    assert.equal((await api.post(`/ev-charging/${row.id}/pay`, owner.auth, { payment: "cash" })).status, 409);

    list = (await api.get("/ev-charging", owner.auth)).body.data;
    assert.equal(list.unpaid.amount, 0);
    assert.equal(list.summary.today.amount, 38);
    assert.equal(list.summary.today.cash, 18);
    assert.equal(list.summary.today.online, 20);
  });

  it("a port with history cannot be deleted, and a cancelled session is not revenue", async () => {
    const owner = await staff("owner");
    const port = (await api.post("/ev-charging/ports", owner.auth, { name: "Port 3" })).body.data;
    const row = await prisma.evCharge.create({ data: { portId: port.id, userId: "9800000901", rate: 50, amount: 0, status: "charging", source: "app", startedAt: new Date(), createdBy: "9800000901" } });
    assert.equal((await api.del(`/ev-charging/ports/${port.id}`, owner.auth)).status, 409);
    assert.equal((await api.post(`/ev-charging/${row.id}/cancel`, owner.auth)).status, 200);
    assert.equal((await api.get("/ev-charging", owner.auth)).body.data.summary.all.amount, 0);
  });

  it("needs the payments permissions", async () => {
    const owner = await staff("owner");
    const noone = await prisma.staffUser.create({ data: { email: "x@test.np", name: "X", role: "staff", permissions: ["slots.view"], passwordHash: "x" } });
    assert.ok(noone.id);
    assert.equal((await api.post("/ev-charging/ports", {} as Record<string, string>, { name: "Nope" })).status, 401);
    assert.equal((await api.get("/ev-charging", owner.auth)).status, 200);
  });
});

describe("EV charging controller (admin)", () => {
  it("keeps the secret hidden, tests the plug, and switches off when staff stop a session", async () => {
    const http = await import("node:http");
    const calls: string[] = [];
    const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { calls.push(JSON.parse(b).action); res.end("{}"); }); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(srv.address() as import("node:net").AddressInfo).port}/plug`;
    try {
      const owner = await staff("owner");
      const port = (await api.post("/ev-charging/ports", owner.auth, { name: "Plug 1" })).body.data;
      assert.equal(port.provider, "manual");
      assert.equal((await api.patch(`/ev-charging/ports/${port.id}`, owner.auth, { provider: "webhook" })).status, 400); // no address yet
      const saved = await api.patch(`/ev-charging/ports/${port.id}`, owner.auth, { provider: "webhook", webhookUrl: url, webhookSecret: "topsecret", deviceId: "tuya-1" });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.hasSecret, true);
      assert.equal(JSON.stringify(saved.body).includes("topsecret"), false);
      assert.equal(saved.body.data.qrToken, port.qrToken); // changing the controller never changes the QR

      assert.equal((await api.post(`/ev-charging/ports/${port.id}/test`, owner.auth, { action: "on" })).status, 200);
      assert.deepEqual(calls, ["on"]);

      const row = await prisma.evCharge.create({ data: { portId: port.id, userId: "9800000902", rate: 50, amount: 0, status: "charging", source: "app", startedAt: new Date(Date.now() - 20 * 60000), createdBy: "9800000902" } });
      assert.equal((await api.post(`/ev-charging/${row.id}/stop`, owner.auth)).status, 200);
      assert.deepEqual(calls, ["on", "off"]);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });
});
