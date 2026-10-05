// Builds ALL tables (customer + admin) in a LOCAL database from prisma/schema.prisma, for development and tests only.
// Refuses any non-local database; never use `prisma db push` against the real database.
import { execSync } from "node:child_process";
import env, { assertSafeDatabaseUrl } from "../src/config/env";

if (env.NODE_ENV === "production") throw new Error("db:push is for local databases only.");
assertSafeDatabaseUrl(env.DATABASE_URL, env.NODE_ENV);
execSync("npx prisma db push --skip-generate", { stdio: "inherit", env: process.env });
