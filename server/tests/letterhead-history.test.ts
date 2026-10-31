import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(async () => {
  await prisma.settings.deleteMany({ where: { key: { startsWith: "letterHeadText:" } } });
  await prisma.docVerification.deleteMany({ where: { title: { startsWith: "Letter Head: " } } });
  await prisma.$disconnect();
});

const sender = (name: string) => ({ name, designation: "Principal", org: "Himalayan School", regNo: "", phone: "", address: "Butwal", website: "" });
const make = (auth: Record<string, string>, subject: string, receiver: string, date: string) =>
  api.post("/letter-head/issue", auth, { subject, receiver, details: `Receiver: ${receiver}`, date, letter: { dear: receiver, body: `Body of ${subject}`, sender: sender(receiver) } });

describe("Letter Head history", () => {
  it("lists the years and months that have letters, with how many", async () => {
    const owner = await staff("owner");
    await prisma.docVerification.deleteMany({ where: { title: { startsWith: "Letter Head: " } } });
    await make(owner.auth, "First", "Sita Sharma", "2026-10-12");
    await make(owner.auth, "Second", "Ram Bahadur", "2026-10-25");
    await make(owner.auth, "Third", "Gita Rai", "2026-09-03");
    await make(owner.auth, "Old one", "Hari Prasad", "2025-12-20");

    const years = (await api.get("/letter-head/history/summary", owner.auth)).body.data;
    assert.deepEqual(years.map((y: { year: number; total: number }) => [y.year, y.total]), [[2026, 3], [2025, 1]]);
    assert.deepEqual(years[0].months, [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0]); // Sep 1, Oct 2
    assert.equal(years[1].months[11], 1); // Dec 2025
  });

  it("gives the letters of one month with their receiver, subject and exact text", async () => {
    const owner = await staff("owner");
    await prisma.docVerification.deleteMany({ where: { title: { startsWith: "Letter Head: " } } });
    await make(owner.auth, "First", "Sita Sharma", "2026-10-12");
    await make(owner.auth, "Second", "Ram Bahadur", "2026-10-25");
    await make(owner.auth, "Elsewhere", "Gita Rai", "2026-09-03");

    const oct = (await api.get("/letter-head/history?year=2026&month=10", owner.auth)).body.data;
    assert.deepEqual(oct.map((l: { subject: string }) => l.subject), ["Second", "First"], "newest letter date first");
    assert.equal(oct[0].receiver, "Ram Bahadur");
    assert.equal(oct[0].date, "2026-10-25");
    assert.match(oct[0].ref, /^2026-\d{3}$/);
    assert.equal(oct[0].letter.body, "Body of Second");
    assert.equal(oct[0].letter.sender.name, "Ram Bahadur");
    assert.equal(oct[0].revoked, false);
    assert.equal((await api.get("/letter-head/history?year=2026&month=11", owner.auth)).body.data.length, 0);
  });

  it("shows a withdrawn letter as withdrawn, and checks the year and month", async () => {
    const owner = await staff("owner");
    await prisma.docVerification.deleteMany({ where: { title: { startsWith: "Letter Head: " } } });
    await make(owner.auth, "To withdraw", "Sita Sharma", "2026-10-12");
    await prisma.docVerification.updateMany({ where: { title: "Letter Head: To withdraw" }, data: { revokedAt: new Date() } });
    const [l] = (await api.get("/letter-head/history?year=2026&month=10", owner.auth)).body.data;
    assert.equal(l.revoked, true);

    assert.equal((await api.get("/letter-head/history?year=2026&month=13", owner.auth)).status, 400);
    assert.equal((await api.get("/letter-head/history?year=abc&month=1", owner.auth)).status, 400);
    assert.equal((await api.get("/letter-head/history", owner.auth)).status, 400);
  });

  it("is only for staff who may make letters", async () => {
    const plain = await staff("staff", "plain@test.np"); // no permissions
    assert.equal((await api.get("/letter-head/history/summary", plain.auth)).status, 403);
    assert.equal((await api.get("/letter-head/history?year=2026&month=10", plain.auth)).status, 403);
  });
});
