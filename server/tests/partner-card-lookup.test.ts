import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import { app, prisma, reset } from "./helpers";

// the shared reset does not clear the partner tables, so this test does
const clean = async () => { await prisma.marketplaceRedemption.deleteMany(); await prisma.marketplaceOffer.deleteMany(); await prisma.marketplacePartner.deleteMany(); };
before(async () => { await reset(); await clean(); });
beforeEach(async () => { await reset(); await clean(); });
after(async () => { await clean(); await prisma.$disconnect(); });

const partner = (token: string, name = "Cafe") =>
  prisma.marketplacePartner.create({ data: { name, category: "Cafe", agreementStart: "2026-01-01", agreementEnd: "2099-01-01", token, createdBy: "t" } as never });
const offer = (partnerId: string, code: string) => prisma.marketplaceOffer.create({ data: { partnerId, title: "All bags", code, discountText: "10% on all bags", pointsCost: 30 } });
const card = (partnerId: string, offerId: string, userId: string, code: string, status = "active") =>
  prisma.marketplaceRedemption.create({ data: { partnerId, offerId, userId, customerName: "Amit Gurung", points: 30, code, status } });
const verify = (token: string, code: string) => request(app).post(`/api/admin/partner/${token}/verify`).send({ code });

describe("Partner dashboard: check a customer's card by card code or mobile number", () => {
  it("finds by code, finds every card of a mobile number at this business only (waiting first), and refuses the rest", async () => {
    const a = await partner("a".repeat(32));
    const b = await partner("b".repeat(32), "Other");
    const oa = await offer(a.id, "D1"), ob = await offer(b.id, "D2");
    await card(a.id, oa.id, "9898989898", "UFM-USED01", "used");
    await card(a.id, oa.id, "9898989898", "UFM-LIVE01");
    await card(b.id, ob.id, "9898989898", "UFM-OTHER1");

    const byCode = await verify("a".repeat(32), "ufm-live01");
    assert.equal(byCode.status, 200);
    assert.equal(byCode.body.data.length, 1);

    const byPhone = await verify("a".repeat(32), "98989 89898");
    assert.equal(byPhone.status, 200);
    assert.deepEqual(byPhone.body.data.map((r: { code: string }) => r.code), ["UFM-LIVE01", "UFM-USED01"], "this business only, waiting card first");
    assert.ok(byPhone.body.data[0].phone.includes("****"), "the number stays masked");

    // the 4-digit code: a waiting card wins over an old used one with the same digits; another business never matches
    await prisma.marketplaceRedemption.updateMany({ where: { code: "UFM-LIVE01" }, data: { shortCode: "4821" } });
    await card(a.id, oa.id, "9812345678", "UFM-OLD001", "used").then((c) => prisma.marketplaceRedemption.update({ where: { id: c.id }, data: { shortCode: "4821" } }));
    const short = await verify("a".repeat(32), "4821");
    assert.equal(short.body.data[0].status, "active");
    assert.equal(short.body.data[0].code, "4821", "the 4-digit code is what shows");
    assert.equal((await verify("b".repeat(32), "4821")).status, 404);

    assert.equal((await verify("a".repeat(32), "9811111111")).status, 404, "no card from this number");
    assert.equal((await verify("a".repeat(32), "UFM-OTHER1")).status, 404, "another business's card");
    assert.equal((await verify("c".repeat(32), "9898989898")).status, 404, "bad link");
  });
});
