// Creates the first owner account from OWNER_EMAIL / OWNER_PASSWORD in .env. Refuses if an owner already exists.
import bcrypt from "bcryptjs";
import env from "../src/config/env";
import { prisma } from "../src/db";

async function main() {
  const email = process.env.OWNER_EMAIL?.toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error("Set OWNER_EMAIL and OWNER_PASSWORD (10+ characters) in .env first.");
  if (await prisma.staffUser.findFirst({ where: { role: "owner" } })) throw new Error("An owner already exists. Add staff from the portal instead.");
  await prisma.staffUser.create({ data: { email, name: process.env.OWNER_NAME || "Owner", role: "owner", passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Owner account created for ${email} (${env.NODE_ENV}). Remove OWNER_PASSWORD from .env now.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
