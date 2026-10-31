import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import ExcelJS from "exceljs";
import request from "supertest";
import { SECTIONS } from "../src/lib/permissions";
import { app, customer, prisma, reset, staff } from "./helpers";

before(reset);
beforeEach(reset);
after(() => prisma.$disconnect());

const download = (path: string, auth: Record<string, string>) =>
  request(app).get(`/api/admin${path}`).set(auth).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  });

async function rowsOf(body: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Customers")!;
  const out: string[][] = [];
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1).map((v) => String(v ?? ""))));
  return out;
}

describe("Customers: Excel export", () => {
  it("the permission is on the roles page, so the owner can give it to staff", () => {
    const all = SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));
    assert.ok(all.includes("customers.export"));
  });

  it("gives an Excel file with name, phone and email, newest filters included", async () => {
    const owner = await staff("owner");
    await customer("9800000001", "Asha Rai");
    await customer("9800000002", "Bikash Thapa");
    await prisma.user.update({ where: { phoneNumber: "9800000002" }, data: { email: "bikash@example.com", isActive: false } });

    const res = await download("/customers/export", owner.auth);
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /spreadsheetml/);
    assert.match(res.headers["content-disposition"], /attachment; filename="unique-futsal-customers-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const rows = await rowsOf(res.body as Buffer);
    assert.deepEqual(rows[0], ["Name", "Phone", "Email", "Status", "Type", "Joined"]);
    assert.deepEqual(rows.slice(1).map((r) => r.slice(0, 5)), [["Asha Rai", "9800000001", "", "Active", "Player"], ["Bikash Thapa", "9800000002", "bikash@example.com", "Suspended", "Player"]]);

    // the same filters as the list: only suspended customers
    const filtered = await rowsOf((await download("/customers/export?status=suspended", owner.auth)).body as Buffer);
    assert.deepEqual(filtered.slice(1).map((r) => r[1]), ["9800000002"]);
    const found = await rowsOf((await download("/customers/export?q=asha", owner.auth)).body as Buffer);
    assert.deepEqual(found.slice(1).map((r) => r[1]), ["9800000001"]);
  });

  it("is only for staff who hold the export permission, and every export is logged", async () => {
    await customer("9800000001", "Asha Rai");
    const viewer = await staff("staff", "viewer@test.np"); // staff with no permissions at all
    assert.equal((await download("/customers/export", viewer.auth)).status, 403);

    await prisma.staffUser.update({ where: { id: viewer.id }, data: { permissions: ["customers.view"] } });
    assert.equal((await download("/customers/export", viewer.auth)).status, 403, "viewing customers is not enough");

    await prisma.staffUser.update({ where: { id: viewer.id }, data: { permissions: ["customers.view", "customers.export"] } });
    assert.equal((await download("/customers/export", viewer.auth)).status, 200);
    const log = await prisma.adminAuditLog.findFirst({ where: { entity: "customers", action: "export" } });
    assert.ok(log);
    assert.match(log!.details ?? "", /"count":1/);

    assert.equal((await request(app).get("/api/admin/customers/export")).status, 401);
    // admins hold every assignable permission
    const admin = await staff("admin", "admin@test.np");
    assert.equal((await download("/customers/export", admin.auth)).status, 200);
  });

  it("a phone number stays text, so Excel keeps it exactly as it is", async () => {
    const owner = await staff("owner");
    await customer("9800000001", "Asha Rai");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await download("/customers/export", owner.auth)).body as unknown as ArrayBuffer);
    const cell = wb.getWorksheet("Customers")!.getCell("B2");
    assert.equal(typeof cell.value, "string");
    assert.equal(cell.value, "9800000001");
  });
});
