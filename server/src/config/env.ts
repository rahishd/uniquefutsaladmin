import dotenv from "dotenv";

dotenv.config();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

// Customer data is the most important thing here: outside production the database MUST be local.
export function assertSafeDatabaseUrl(databaseUrl: string, nodeEnv: string): void {
  if (nodeEnv === "production") return;
  let host = "";
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to start: NODE_ENV=${nodeEnv} but DATABASE_URL points to "${host}". Development and tests must use a local database.`);
  }
}

const PLACEHOLDER = /^(your_|change[-_ ]?me|secret$)/i;

function requireSecret(name: string, value: string | undefined): string {
  if (!value || value.length < 32 || PLACEHOLDER.test(value)) {
    throw new Error(`${name} must be set to a random string of at least 32 characters.`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV || "development";
const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");
assertSafeDatabaseUrl(DATABASE_URL, NODE_ENV);

export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT) || 5100,
  DATABASE_URL,
  ADMIN_JWT_SECRET: requireSecret("ADMIN_JWT_SECRET", process.env.ADMIN_JWT_SECRET),
  ADMIN_JWT_EXPIRE: process.env.ADMIN_JWT_EXPIRE || "12h",
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
};

export default env;
