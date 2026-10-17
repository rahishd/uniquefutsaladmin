import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { api, app, customer, PASSWORD, prisma, reset, staff, todayKey } from "./helpers";
import { birthdayEndings } from "../src/modules/birthdays";
import { ageOn } from "../src/lib/age";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

/** The birth date of someone who turns `years` today. */
const dobFor = (years: number, today = todayKey()) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
const codes = (list: object[]) => prisma.settings.create({ data: { key: "promoCodes", value: JSON.stringify(list) } });
const SPRING = { code: "BDAY20", type: "percent", value: 20, label: "20% OFF", appliedTo: "booking", isActive: true };

async function people() {
  await customer("9800000101", "Asha Rai").then(() => prisma.user.update({ where: { phoneNumber: "9800000101" }, data: { dateOfBirth: dobFor(24) } }));
  await customer("9800000102", "Bikash Thapa").then(() => prisma.user.update({ where: { phoneNumber: "9800000102" }, data: { dateOfBirth: dobFor(31) } }));
  const otherDay = todayKey().endsWith("-01-02") ? "1990-01-03" : "1990-01-02"; // a birthday that is not today
  await customer("9800000103", "Not Today").then(() => prisma.user.update({ where: { phoneNumber: "9800000103" }, data: { dateOfBirth: otherDay } }));
  await customer("9800000104", "No Birthdate");
  await customer("9800000105", "Suspended Sam").then(() => prisma.user.update({ where: { phoneNumber: "9800000105" }, data: { dateOfBirth: dobFor(22), isActive: false } }));
}

describe("birthday dates", () => {
  it("counts whole years and moves 29 Feb to 28 Feb in a normal year", () => {
    assert.equal(ageOn("2000-10-17", "2026-10-17"), 26);
    assert.equal(ageOn("2000-10-18", "2026-10-17"), 25);
    assert.equal(ageOn("2001-02-30", "2026-10-17"), null);
    assert.deepEqual(birthdayEndings("2026-10-17"), ["-10-17"]);
    assert.deepEqual(birthdayEndings("2027-02-28"), ["-02-28", "-02-29"]); // 2027 has no 29 Feb
    assert.deepEqual(birthdayEndings("2028-02-28"), ["-02-28"]); // 2028 does
  });
});

describe("Site Content: birthdays today", () => {
  it("lists active customers whose birthday is today, with their age", async () => {
    const s = await staff("owner");
    await people();
    const r = await api.get("/content/birthdays", s.auth);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.people.map((p: { phone: string }) => p.phone).sort(), ["9800000101", "9800000102"]);
    const asha = r.body.data.people.find((p: { phone: string }) => p.phone === "9800000101");
    assert.equal(asha.age, 24);
    assert.equal(asha.wished, false);
  });

  it("offers only promo codes that are on and not past their last day", async () => {
    const s = await staff("owner");
    await codes([SPRING, { ...SPRING, code: "OLD10", expiryDate: "2020-01-01" }, { ...SPRING, code: "OFF10", isActive: false }]);
    const r = await api.get("/content/birthdays", s.auth);
    assert.deepEqual(r.body.data.promoCodes.map((c: { code: string }) => c.code), ["BDAY20"]);
  });

  it("sends a wish to the bell with the first name filled in", async () => {
    const s = await staff("owner");
    await people();
    const r = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101", "9800000102"] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.sent, 2);
    const n = await prisma.notification.findFirst({ where: { userId: "9800000101" } });
    assert.equal(n?.type, "general");
    assert.equal(n?.title, "Happy Birthday!");
    assert.match(n!.message, /^Happy Birthday, Asha!/);
    assert.equal(n?.href, "/");
  });

  it("adds a promo code as a gift, and a custom message", async () => {
    const s = await staff("owner");
    await people();
    await codes([SPRING]);
    const r = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101"], message: "Many happy returns, {name}!", promoCode: "bday20" });
    assert.equal(r.status, 201);
    const n = await prisma.notification.findFirst({ where: { userId: "9800000101" } });
    assert.equal(n?.type, "promo");
    assert.match(n!.message, /^Many happy returns, Asha! A birthday gift: use code BDAY20 \(20% OFF\)/);
    assert.equal(n?.href, "/promos");
  });

  it("never wishes the same person twice in a year", async () => {
    const s = await staff("owner");
    await people();
    assert.equal((await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101"] })).body.data.sent, 1);
    const again = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101", "9800000102"] });
    assert.equal(again.body.data.sent, 1); // only Bikash
    assert.equal(again.body.data.alreadyWished, 1);
    assert.equal(await prisma.notification.count({ where: { userId: "9800000101" } }), 1);
    const list = await api.get("/content/birthdays", s.auth);
    assert.ok(list.body.data.people.every((p: { wished: boolean }) => p.wished));
  });

  it("ignores people with no birthday today and refuses codes that are off", async () => {
    const s = await staff("owner");
    await people();
    const none = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000103", "9800000104", "9800000105"] });
    assert.equal(none.status, 404);
    await codes([{ ...SPRING, isActive: false }]);
    assert.equal((await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101"], promoCode: "BDAY20" })).status, 400);
    assert.equal(await prisma.notification.count(), 0);
  });

  it("skips customers who turned promotional notices off when a code is attached", async () => {
    const s = await staff("owner");
    await people();
    await codes([SPRING]);
    await prisma.userPrefs.create({ data: { userId: "9800000102", promoNotifications: false } });
    const r = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000101", "9800000102"], promoCode: "BDAY20" });
    assert.equal(r.body.data.sent, 1);
    assert.equal(r.body.data.skippedOptOut, 1);
    // a plain wish (no code) still reaches them
    const plain = await api.post("/content/birthdays/wish", s.auth, { phones: ["9800000102"] });
    assert.equal(plain.body.data.sent, 1);
  });

  it("needs the permission to send, and is written to the audit log", async () => {
    const owner = await staff("owner");
    await people();
    await prisma.staffUser.create({ data: { email: "viewer@test.np", name: "Viewer", role: "staff", permissions: ["content.view"], passwordHash: await bcrypt.hash(PASSWORD, 4) } });
    const login = await request(app).post("/api/admin/auth/login").send({ email: "viewer@test.np", password: PASSWORD });
    const viewer = { Authorization: `Bearer ${login.body.data.token}` };
    assert.equal((await api.get("/content/birthdays", viewer)).status, 200);
    assert.equal((await api.post("/content/birthdays/wish", viewer, { phones: ["9800000101"] })).status, 403);
    assert.equal((await api.post("/content/birthdays/wish", owner.auth, { phones: [] })).status, 400);
    await api.post("/content/birthdays/wish", owner.auth, { phones: ["9800000101"] });
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "birthday_wish" } }), 1);
  });
});
