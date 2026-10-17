import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, customer, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

describe("Notices can open a link", () => {
  const send = (auth: Record<string, string>, href: string) =>
    api.post("/notifications/broadcast", auth, { type: "general", audience: "customer", phone: "9800000961", title: "Offer", message: "Tap to see the offer.", href });

  it("accepts a page of the app and an https address, and stores it", async () => {
    const s = await staff("owner");
    await customer("9800000961", "Link Tester");
    assert.equal((await send(s.auth, "/promos")).status, 201);
    assert.equal((await send(s.auth, "https://example.com/offer?id=1")).status, 201);
    const rows = await prisma.notification.findMany({ where: { userId: "9800000961" }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((r) => r.href), ["/promos", "https://example.com/offer?id=1"]);
  });

  it("refuses anything that is not a page or an https address", async () => {
    const s = await staff("owner");
    await customer("9800000961", "Link Tester");
    for (const bad of ["http://example.com", "javascript:alert(1)", "ftp://example.com/file", "example.com", "//evil.com/x"]) {
      assert.equal((await send(s.auth, bad)).status, 400, bad);
    }
    assert.equal(await prisma.notification.count(), 0);
  });
});
