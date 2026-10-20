import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, prisma, reset, staff, todayKey, addDaysKey } from "./helpers";
import { setPushSender } from "../src/lib/push";
import { pushDueReminders, REPEAT_MS } from "../src/modules/reminders";

before(reset);
beforeEach(reset);
after(async () => { setPushSender(null); await prisma.$disconnect(); });

const body = (extra: object = {}) => ({ title: "Count the cash drawer", date: todayKey(), time: "08:00", ...extra });
const past = () => body({ date: addDaysKey(todayKey(), -1), time: "09:00" }); // already due
const future = () => body({ date: addDaysKey(todayKey(), 3) });

describe("Reminders", () => {
  it("those who manage reminders add them; others cannot", async () => {
    const owner = await staff("owner");
    const plain = await staff("staff", "plain@test.np");
    assert.equal((await api.post("/reminders", plain.auth, body())).status, 403);
    const r = await api.post("/reminders", owner.auth, body({ note: "Before opening" }));
    assert.equal(r.status, 201);
    assert.equal(r.body.data.forName, "Everyone");
    assert.equal((await api.post("/reminders", owner.auth, body({ time: "25:00" }))).status, 400);
    assert.equal((await api.post("/reminders", owner.auth, body({ title: " " }))).status, 400);
    assert.equal((await api.post("/reminders", owner.auth, body({ forStaffId: "nobody" }))).status, 400);
  });

  it("a due reminder pops up for the person it is for, and for everyone when it is for all", async () => {
    const owner = await staff("owner");
    const a = await staff("staff", "a@test.np");
    const b = await staff("staff", "b@test.np");
    await api.post("/reminders", owner.auth, past()); // everyone
    await api.post("/reminders", owner.auth, { ...past(), title: "Only A", forStaffId: a.id });
    await api.post("/reminders", owner.auth, future()); // not yet

    const forA = (await api.get("/reminders/due", a.auth)).body.data.map((x: { title: string }) => x.title).sort();
    const forB = (await api.get("/reminders/due", b.auth)).body.data.map((x: { title: string }) => x.title);
    assert.deepEqual(forA, ["Count the cash drawer", "Only A"]);
    assert.deepEqual(forB, ["Count the cash drawer"]);
  });

  it("staff only list reminders meant for them, unless they may view all", async () => {
    const owner = await staff("owner");
    const a = await staff("staff", "a@test.np");
    const b = await staff("staff", "b@test.np");
    await api.post("/reminders", owner.auth, { ...future(), title: "Only A", forStaffId: a.id });
    await api.post("/reminders", owner.auth, { ...future(), title: "All" });
    const titles = async (s: { auth: Record<string, string> }) => (await api.get("/reminders", s.auth)).body.data.open.map((x: { title: string }) => x.title).sort();
    assert.deepEqual(await titles(a), ["All", "Only A"]);
    assert.deepEqual(await titles(b), ["All"]);
    assert.deepEqual(await titles(owner), ["All", "Only A"]);
  });

  it("done stops the pop-up; a reminder for someone else cannot be touched", async () => {
    const owner = await staff("owner");
    const a = await staff("staff", "a@test.np");
    const b = await staff("staff", "b@test.np");
    const mine = (await api.post("/reminders", owner.auth, { ...past(), forStaffId: a.id })).body.data.id;
    assert.equal((await api.post(`/reminders/${mine}/done`, b.auth)).status, 403);
    assert.equal((await api.post(`/reminders/${mine}/snooze`, b.auth, { minutes: 10 })).status, 403);
    const done = await api.post(`/reminders/${mine}/done`, a.auth);
    assert.equal(done.status, 200);
    assert.equal(done.body.data.status, "done");
    assert.equal(done.body.data.doneByName, "staff person");
    assert.equal((await api.get("/reminders/due", a.auth)).body.data.length, 0);
    assert.equal((await api.get("/reminders", owner.auth)).body.data.done.length, 1);
  });

  it("snooze hides it for a while", async () => {
    const owner = await staff("owner");
    const id = (await api.post("/reminders", owner.auth, past())).body.data.id;
    assert.equal((await api.get("/reminders/due", owner.auth)).body.data.length, 1);
    assert.equal((await api.post(`/reminders/${id}/snooze`, owner.auth, { minutes: 7 })).status, 400);
    assert.equal((await api.post(`/reminders/${id}/snooze`, owner.auth, { minutes: 10 })).status, 200);
    assert.equal((await api.get("/reminders/due", owner.auth)).body.data.length, 0);
    await prisma.reminder.update({ where: { id }, data: { snoozedUntil: new Date(Date.now() - 1000) } });
    assert.equal((await api.get("/reminders/due", owner.auth)).body.data.length, 1);
  });

  it("a daily reminder sets itself for the next day when it is done", async () => {
    const owner = await staff("owner");
    const id = (await api.post("/reminders", owner.auth, { ...past(), repeat: "daily" })).body.data.id;
    await api.post(`/reminders/${id}/done`, owner.auth);
    const open = (await api.get("/reminders", owner.auth)).body.data.open;
    assert.equal(open.length, 1);
    assert.equal(open[0].repeat, "daily");
    assert.ok(new Date(open[0].dueAt).getTime() > Date.now(), "the next one is in the future");
    assert.equal((await api.get("/reminders/due", owner.auth)).body.data.length, 0);
  });

  it("edit and delete need the manage permission; a new time starts alerting again", async () => {
    const owner = await staff("owner");
    const plain = await staff("staff", "plain@test.np");
    const id = (await api.post("/reminders", owner.auth, past())).body.data.id;
    assert.equal((await api.patch(`/reminders/${id}`, plain.auth, { title: "x" })).status, 403);
    assert.equal((await api.del(`/reminders/${id}`, plain.auth)).status, 403);
    await prisma.reminder.update({ where: { id }, data: { lastNotifiedAt: new Date() } });
    const edited = await api.patch(`/reminders/${id}`, owner.auth, { time: "10:30", title: "New title" });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.title, "New title");
    assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id } })).lastNotifiedAt, null);
    assert.equal((await api.del(`/reminders/${id}`, owner.auth)).status, 200);
    assert.equal(await prisma.reminder.count(), 0);
  });

  it("sends a phone alert when due, repeats every few minutes, and stops once done", async () => {
    const owner = await staff("owner");
    await prisma.staffPushSubscription.create({ data: { staffId: owner.id, endpoint: "https://push.test/owner", p256dh: "p", auth: "a" } });
    const sent: { title: string; body: string; href?: string }[] = [];
    setPushSender(async (_sub, payload) => { sent.push(JSON.parse(payload)); });

    const id = (await api.post("/reminders", owner.auth, { ...past(), note: "Before opening" })).body.data.id;
    await prisma.reminder.update({ where: { id }, data: { dueAt: new Date(Date.now() - 30 * 60_000) } }); // 30 minutes ago
    await api.post("/reminders", owner.auth, future()); // not due: no alert

    assert.equal(await pushDueReminders(), 1);
    assert.deepEqual(sent[0], { title: "Reminder: Count the cash drawer", body: "Before opening", href: "/reminders", tag: `reminder-${id}`, urgent: true });
    assert.equal(await pushDueReminders(), 0, "not again straight away");

    assert.equal(await pushDueReminders(new Date(Date.now() + REPEAT_MS + 1000)), 1, "again after the repeat time");

    await api.post(`/reminders/${id}/done`, owner.auth);
    assert.equal(await pushDueReminders(new Date(Date.now() + 3 * REPEAT_MS)), 0, "nothing once it is done");

    // very old reminders stop alerting
    await api.post("/reminders", owner.auth, { title: "Ancient", date: addDaysKey(todayKey(), -5), time: "09:00" });
    assert.equal(await pushDueReminders(), 0);
  });
});
