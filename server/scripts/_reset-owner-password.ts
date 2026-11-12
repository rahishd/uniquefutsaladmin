// One-off local reset: sets the owner's password from OWNER_NEW_PASSWORD. Local dev database only.
import bcrypt from "bcryptjs";
import { prisma } from "../src/db";

async function main() {
  const email = process.env.OWNER_EMAIL?.toLowerCase();
  const password = process.env.OWNER_NEW_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error("Set OWNER_EMAIL and OWNER_NEW_PASSWORD (10+ characters).");
  const owner = await prisma.staffUser.findFirst({ where: { email, role: "owner" } });
  if (!owner) throw new Error(`No owner account found for ${email}.`);
  await prisma.staffUser.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Password updated for ${email}.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
