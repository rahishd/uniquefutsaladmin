import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

describe("Complaints: reported chat messages", () => {
  it("shows a chat report in the list with its own label, and can filter by it", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    await prisma.complaint.create({ data: { code: "CP-CHAT01", userId: "9880000001", category: "chat", message: 'Reported chat message (Harassment or bullying)\nFrom: Sita (9880000002)\nMessage: "rude words"\nMessage ref: abc123' } });
    await prisma.complaint.create({ data: { code: "CP-BOOK01", userId: "9880000001", category: "booking", message: "The slot was double booked" } });

    const all = (await api.get("/complaints", owner.auth)).body.data;
    assert.equal(all.total, 2);
    const chat = all.items.find((c: { code: string }) => c.code === "CP-CHAT01");
    assert.equal(chat.categoryLabel, "Chat message");
    assert.match(chat.message, /From: Sita \(9880000002\)/);
    assert.equal(chat.customerName, "Raju Rai"); // the person who made the report

    const only = (await api.get("/complaints?category=chat", owner.auth)).body.data;
    assert.equal(only.total, 1);
    assert.equal(only.items[0].code, "CP-CHAT01");
  });

  it("lets staff reply and tells the person who reported", async () => {
    const owner = await staff("owner");
    await customer("9880000001", "Raju Rai");
    const c = await prisma.complaint.create({ data: { code: "CP-CHAT02", userId: "9880000001", category: "chat", message: "Reported chat message (Spam or scam)\nMessage ref: xyz" } });
    const res = await api.patch(`/complaints/${c.id}`, owner.auth, { status: "resolved", reply: "We have spoken to that customer." });
    assert.equal(res.status, 200);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: "9880000001", type: "complaint" } });
    assert.match(n.message, /We have spoken/);
  });
});
