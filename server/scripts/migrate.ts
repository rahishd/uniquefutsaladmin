// Applies sql/*.sql (admin-owned tables only) once each, in file order. Safe on the live database:
// every statement is additive and guarded with IF NOT EXISTS. It never touches customer tables.
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/db";

async function main() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_admin_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP DEFAULT now())`);
  const done = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT "name" FROM "_admin_migrations"`)).map((r) => r.name));
  const dir = path.join(__dirname, "..", "sql");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const statements = fs.readFileSync(path.join(dir, f), "utf8").split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
    for (const s of statements) await prisma.$executeRawUnsafe(s);
    await prisma.$executeRawUnsafe(`INSERT INTO "_admin_migrations"("name") VALUES ($1)`, f);
    console.log("applied", f);
  }
  console.log("Admin tables are up to date.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
