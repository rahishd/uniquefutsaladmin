import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff } from "./helpers";
import { parseNumbers } from "../src/modules/sms-mass";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

// the gateway is stubbed: nothing real is sent, every request is remembered
const realFetch = globalThis.fetch;
let calls: { to: string; text: string }[] = [];
let failNumber = "";
function gateway(on: boolean) {
  process.env.SMS_PROVIDER = on ? "android" : "sparrow";
  process.env.SMSGATE_USERNAME = on ? "u" : "";
  process.env.SMSGATE_PASSWORD = on ? "p" : "";
  process.env.SPARROW_SMS_TOKEN = "";
  process.env.SPARROW_SMS_IDENTITY = "";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!String(url).includes("sms-gate.app")) return realFetch(url, init);
    const b = JSON.parse(String(init?.body));
    const to = b.phoneNumbers[0] as string;
    if (failNumber && to.endsWith(failNumber)) return new Response(JSON.stringify({ message: "queue limits exceeded" }), { status: 503 });
    calls.push({ to, text: b.textMessage.text });
    return new Response(JSON.stringify({ id: `m${calls.length}` }), { status: 202 });
  }) as typeof fetch;
}
beforeEach(() => { calls = []; failNumber = ""; gateway(true); });
after(() => { globalThis.fetch = realFetch; });

const done = async (owner: { auth: Record<string, string> }) => {
  for (let i = 0; i < 40; i++) {
    const c = (await api.get("/sms/campaigns", owner.auth)).body.data[0];
    if (c && c.status !== "sending") return c;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("campaign did not finish");
};

describe("mobile numbers from free text", () => {
  it("accepts any separators and +977 / 977 / 0 in front, drops repeats, counts the rest as invalid", () => {
    const r = parseNumbers("9801234567, +9779801234568\n09801234569; 977 9801234570 9801234567 12345 abc");
    assert.deepEqual(r.numbers.sort(), ["9801234567", "9801234568", "9801234569", "9801234570"]);
    assert.equal(r.invalid, 3); // "977" alone, 12345, abc
  });
});

describe("Mass SMS: who can be reached", () => {
  it("counts each group, leaves out people who switched off promotional messages, and skips suspended accounts", async () => {
    const owner = await staff("owner");
    await customer("9801000001", "Sita Rai");
    await customer("9801000002", "Ram Rai");
    await customer("9801000003", "Hari Rai");
    await prisma.userPrefs.create({ data: { userId: "9801000002", promoNotifications: false } });
    await prisma.user.update({ where: { phoneNumber: "9801000003" }, data: { isActive: false } });
    await prisma.vipCode.create({ data: { userId: "9801000001", code: "VIPTEST1", type: "percent", value: 10, active: true, createdBy: "test" } });

    const a = (await api.get("/sms/audiences", owner.auth)).body.data;
    const n = (k: string) => a.audiences.find((x: { key: string }) => x.key === k).count;
    assert.equal(a.configured, true);
    assert.equal(n("all"), 1); // Sita only: Ram opted out, Hari is suspended
    assert.equal(n("vip"), 1);
    assert.equal(n("members"), 0);
    assert.equal(n("new7"), 1);

    const p = (await api.post("/sms/campaigns/preview", owner.auth, { audience: "all" })).body.data;
    assert.equal(p.count, 1);
    assert.equal(p.optedOut, 1);
    assert.equal(p.sample[0].name, "Sita");

    // a typed list is sent as typed, even to someone who opted out, and to people with no account
    const t = (await api.post("/sms/campaigns/preview", owner.auth, { audience: "numbers", numbers: "9801000002, 9809999999, nonsense" })).body.data;
    assert.equal(t.count, 2);
    assert.equal(t.invalid, 1);
    assert.deepEqual(t.sample.map((x: { name: string }) => x.name), ["Ram", "Friend"]);
  });

  it("finds recent players, lapsed players and birthdays", async () => {
    const owner = await staff("owner");
    await customer("9801000011", "Played Recently");
    await customer("9801000012", "Gone Quiet");
    await customer("9801000013", "Birthday Boy");
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.user.updateMany({ where: { phoneNumber: { in: ["9801000011", "9801000012", "9801000013"] } }, data: { createdAt: old } });
    const today = new Date(Date.now() + 5.75 * 3600 * 1000).toISOString().slice(0, 10);
    await prisma.user.update({ where: { phoneNumber: "9801000013" }, data: { dateOfBirth: `2005-${today.slice(5)}` } });
    await prisma.booking.create({ data: { userId: "9801000011", date: today, startTime: "18:00", endTime: "19:00", duration: 1, status: "completed", paymentMethod: "venue", basePrice: 1000, subtotal: 1000, totalPrice: 1000, customerPhone: "9801000011", customerName: "Played Recently" } as never });

    const a = (await api.get("/sms/audiences", owner.auth)).body.data;
    const n = (k: string) => a.audiences.find((x: { key: string }) => x.key === k).count;
    assert.equal(n("played30"), 1);
    assert.equal(n("lapsed60"), 2); // Gone Quiet and Birthday Boy
    assert.equal(n("birthday"), 1);
  });
});

describe("Mass SMS: sending", () => {
  it("sends a personal text to everyone in the group, logs each, and keeps count", async () => {
    const owner = await staff("owner");
    await customer("9801000021", "Sita Rai");
    await customer("9801000022", "Ram Rai");
    const r = await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "Happy Dashain, {name}! Enjoy 10% off this week.", expected: 2 });
    assert.equal(r.status, 201);
    const c = await done(owner);
    assert.equal(c.status, "done");
    assert.equal(c.sent, 2);
    assert.equal(c.failed, 0);
    assert.deepEqual(calls.map((x) => x.text).sort(), ["Happy Dashain, Ram! Enjoy 10% off this week.", "Happy Dashain, Sita! Enjoy 10% off this week."]);
    assert.ok(calls.every((x) => x.to.startsWith("+977")));
    assert.equal(await prisma.smsLog.count({ where: { kind: "mass", status: "queued" } }), 2);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "sms.campaign.start" } }), 1);
  });

  it("counts the ones the gateway refused as failed and records why", async () => {
    const owner = await staff("owner");
    await customer("9801000031", "Sita Rai");
    await customer("9801000032", "Ram Rai");
    failNumber = "9801000032";
    await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "Hello {name}, see you on the pitch.", expected: 2 });
    const c = await done(owner);
    assert.equal(c.sent, 1);
    assert.equal(c.failed, 1);
    const bad = await prisma.smsLog.findFirstOrThrow({ where: { status: "failed" } });
    assert.match(bad.error ?? "", /queue limits exceeded/);
  });

  it("refuses when the group changed since the staff member looked, a bad text, no gateway, or someone without permission", async () => {
    const owner = await staff("owner");
    await customer("9801000041", "Sita Rai");
    assert.equal((await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "Hello there everyone", expected: 5 })).status, 409);
    assert.equal((await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "Hi {code}", expected: 1 })).status, 400);
    assert.equal((await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "x".repeat(400), expected: 1 })).status, 400);
    assert.equal((await api.post("/sms/campaigns", owner.auth, { audience: "birthday", body: "Happy birthday {name}!", expected: 1 })).status, 400); // nobody to send to
    gateway(false);
    assert.equal((await api.post("/sms/campaigns", owner.auth, { audience: "all", body: "Hello there everyone", expected: 1 })).status, 503);
    gateway(true);
    const s = await staff("staff");
    assert.equal((await api.post("/sms/campaigns", s.auth, { audience: "all", body: "Hello there everyone", expected: 1 })).status, 403);
    assert.equal(calls.length, 0);
    assert.equal(await prisma.smsCampaign.count(), 0);
  });

  it("sends a test text to one number only", async () => {
    const owner = await staff("owner");
    const r = await api.post("/sms/campaigns/test", owner.auth, { body: "Test for {name}", phone: "9801000051" });
    assert.equal(r.status, 200);
    assert.deepEqual(calls, [{ to: "+9779801000051", text: "Test for Friend" }]);
    assert.equal(await prisma.smsLog.count({ where: { kind: "test" } }), 1);
    assert.equal((await api.post("/sms/campaigns/test", owner.auth, { body: "Test for {name}", phone: "9801000051, 9801000052" })).status, 400);
  });
});

describe("Login details for new customers", () => {
  it("lists new customers, sends the details (never a password), and remembers who got them", async () => {
    const owner = await staff("owner");
    await customer("9801000061", "Sita Rai");
    await customer("9801000062", "Old Timer");
    await prisma.user.update({ where: { phoneNumber: "9801000062" }, data: { createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } });

    const before = (await api.get("/sms/new-customers", owner.auth)).body.data;
    assert.deepEqual(before.items.map((x: { phone: string }) => x.phone), ["9801000061"]); // only the recent one
    assert.equal(before.items[0].detailsSentAt, null);

    const r = await api.post("/sms/login-details", owner.auth, { phones: ["9801000061"] });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.sent, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /Welcome to Unique Futsal, Sita!/);
    assert.match(calls[0].text, /9801000061/);
    assert.match(calls[0].text, /Continue with OTP/);
    assert.doesNotMatch(calls[0].text, /password:|temporary/i);
    assert.equal(await prisma.smsLog.count({ where: { kind: "login_details", phoneNumber: "9801000061" } }), 1);

    const after = (await api.get("/sms/new-customers", owner.auth)).body.data;
    assert.ok(after.items[0].detailsSentAt);

    // a number with no account gets nothing
    const none = await api.post("/sms/login-details", owner.auth, { phones: ["9809999999"] });
    assert.equal(none.body.data.sent, 0);
    assert.equal(calls.length, 1);
  });

  it("uses the wording staff saved", async () => {
    const owner = await staff("owner");
    await customer("9801000071", "Sita Rai");
    assert.equal((await api.put("/sms/templates/login_details", owner.auth, { body: "Hi {name}, sign in to {link} with {phone}." })).status, 200);
    await api.post("/sms/login-details", owner.auth, { phones: ["9801000071"] });
    assert.equal(calls[0].text, "Hi Sita, sign in to www.uniquefutsal.com with 9801000071.");
  });
});
