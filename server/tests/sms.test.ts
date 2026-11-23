import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const row = (o: Record<string, unknown>) => prisma.smsLog.create({ data: { phoneNumber: "9800000001", kind: "booking_confirmed", message: "Dear Sita, your booking is confirmed.", status: "queued", provider: "android", ...o } as never });

describe("SMS page: sent messages", () => {
  it("lists newest first, filters by kind, status and text, and counts", async () => {
    const owner = await staff("owner");
    await row({ createdAt: new Date(Date.now() - 3000), recipientName: "Sita Rai", bookingCode: "UF-AAA111" });
    await row({ createdAt: new Date(Date.now() - 2000), phoneNumber: "9800000002", kind: "otp", message: "•••••• is your Unique Futsal code.", recipientName: "Ram" });
    await row({ createdAt: new Date(Date.now() - 1000), phoneNumber: "9800000003", kind: "booking_cancelled", status: "failed", error: "Gateway error 503", message: "Dear Hari, cancelled." });

    const all = (await api.get("/sms/logs", owner.auth)).body.data;
    assert.equal(all.total, 3);
    assert.equal(all.stats.last24, 3);
    assert.equal(all.stats.failedWeek, 1);
    assert.equal(all.items[0].kind, "booking_cancelled"); // newest first
    assert.equal(all.items[0].kindLabel, "Cancelled booking");

    assert.equal((await api.get("/sms/logs?kind=otp", owner.auth)).body.data.total, 1);
    assert.equal((await api.get("/sms/logs?status=failed", owner.auth)).body.data.items[0].error, "Gateway error 503");
    assert.equal((await api.get("/sms/logs?q=sita", owner.auth)).body.data.total, 1); // by name
    assert.equal((await api.get("/sms/logs?q=UF-AAA", owner.auth)).body.data.total, 1); // by booking code
    assert.equal((await api.get("/sms/logs?q=9800000002", owner.auth)).body.data.total, 1); // by number
    assert.equal((await api.get("/sms/logs?from=2099-01-01", owner.auth)).body.data.total, 0);
  });

  it("needs the view permission", async () => {
    const s = await staff("staff");
    assert.equal((await api.get("/sms/logs", s.auth)).status, 403);
  });
});

describe("SMS page: wording", () => {
  it("shows the standard wording, saves a custom one, and resets it", async () => {
    const owner = await staff("owner");
    const first = (await api.get("/sms/templates", owner.auth)).body.data as { key: string; custom: boolean; body: string; defaultBody: string; preview: string }[];
    assert.deepEqual(first.map((t) => t.key), ["booking_requested", "booking_confirmed", "booking_cancelled", "otp", "login_details", "reminder"]);
    assert.ok(first.every((t) => !t.custom && t.body === t.defaultBody));

    const put = await api.put("/sms/templates/booking_confirmed", owner.auth, { body: "Hi {name}! {time} on {date} is booked. Code {code}.{due}" });
    assert.equal(put.status, 200);
    assert.equal(put.body.data.custom, true);
    assert.equal(put.body.data.preview, "Hi Sita! 18:00 on Sat, 15 Nov is booked. Code UF-7K2M9Q. Please pay Rs. 500 at the venue.");
    const saved = JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "smsTemplates" } })).value);
    assert.match(saved.booking_confirmed, /^Hi \{name\}!/);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "sms.template.update" } }), 1);

    const reset = await api.del("/sms/templates/booking_confirmed", owner.auth);
    assert.equal(reset.body.data.custom, false);
    assert.equal(JSON.parse((await prisma.settings.findUniqueOrThrow({ where: { key: "smsTemplates" } })).value).booking_confirmed, undefined);
  });

  it("refuses placeholders that do not belong, an OTP message without {otp}, open braces and silly lengths", async () => {
    const owner = await staff("owner");
    assert.equal((await api.put("/sms/templates/booking_cancelled", owner.auth, { body: "Cancelled, code {code}" })).status, 400); // {code} is not offered here
    assert.equal((await api.put("/sms/templates/otp", owner.auth, { body: "Your code is on its way" })).status, 400);
    assert.equal((await api.put("/sms/templates/booking_confirmed", owner.auth, { body: "Hello {name, see you" })).status, 400);
    assert.equal((await api.put("/sms/templates/booking_confirmed", owner.auth, { body: "x".repeat(400) })).status, 400);
    assert.equal((await api.put("/sms/templates/nope", owner.auth, { body: "Hello there friend" })).status, 404);
    assert.equal((await api.put("/sms/templates/otp", owner.auth, { body: "Code: {otp}. Keep it secret." })).status, 200);
  });

  it("staff without the manage permission can look but not change", async () => {
    const s = await staff("staff");
    assert.equal((await api.put("/sms/templates/otp", s.auth, { body: "Code: {otp}. Keep it secret." })).status, 403);
  });
});
