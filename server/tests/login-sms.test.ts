import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff } from "./helpers";
import { loginSmsText } from "../src/modules/customers";

before(reset);
beforeEach(reset);
after(async () => { await prisma.$disconnect(); });

describe("Login details by SMS for a customer staff just added", () => {
  it("the text is short (under 30 words) and has the number, the password and where to sign in", () => {
    const t = loginSmsText("9801234567", "abcd2345");
    assert.ok(t.split(/\s+/).length < 30);
    assert.ok(t.includes("9801234567") && t.includes("abcd2345") && /uniquefutsal/i.test(t));
  });

  it("sends through the gateway, and keeps the password out of the log", async () => {
    const owner = await staff("owner");
    await customer("9802100001", "New Player");
    const saved = { fetch: globalThis.fetch, p: process.env.SMS_PROVIDER, u: process.env.SMSGATE_USERNAME, w: process.env.SMSGATE_PASSWORD };
    process.env.SMS_PROVIDER = "android"; process.env.SMSGATE_USERNAME = "u"; process.env.SMSGATE_PASSWORD = "p";
    let sentText = "";
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => { sentText = JSON.parse(init?.body ?? "{}").textMessage?.text ?? ""; return new Response(JSON.stringify({ id: "x" }), { status: 202 }); }) as typeof fetch;
    try {
      const r = await api.post("/customers/login-sms", owner.auth, { phone: "9802100001", password: "abcd2345" });
      assert.equal(r.status, 200);
      assert.ok(sentText.includes("abcd2345") && sentText.split(/\s+/).length < 30);
      const log = await prisma.smsLog.findFirst({ where: { phoneNumber: "9802100001" } });
      assert.ok(log && !log.message.includes("abcd2345") && log.kind === "login_details");
      assert.equal((await api.post("/customers/login-sms", owner.auth, { phone: "9809999999", password: "abcd2345" })).status, 404);
    } finally {
      globalThis.fetch = saved.fetch;
      for (const [k, v] of [["SMS_PROVIDER", saved.p], ["SMSGATE_USERNAME", saved.u], ["SMSGATE_PASSWORD", saved.w]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  it("says so clearly when the SMS gateway is not set up", async () => {
    const owner = await staff("owner");
    await customer("9802100002", "No Gateway");
    const saved = { p: process.env.SMS_PROVIDER, u: process.env.SMSGATE_USERNAME, t: process.env.SPARROW_SMS_TOKEN };
    process.env.SMS_PROVIDER = "android"; delete process.env.SMSGATE_USERNAME; delete process.env.SPARROW_SMS_TOKEN;
    try {
      assert.equal((await api.post("/customers/login-sms", owner.auth, { phone: "9802100002", password: "abcd2345" })).status, 503);
    } finally {
      if (saved.p === undefined) delete process.env.SMS_PROVIDER; else process.env.SMS_PROVIDER = saved.p;
      if (saved.u !== undefined) process.env.SMSGATE_USERNAME = saved.u;
      if (saved.t !== undefined) process.env.SPARROW_SMS_TOKEN = saved.t;
    }
  });
});
