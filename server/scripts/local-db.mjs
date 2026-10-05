// Starts a throw-away local PostgreSQL for development and tests (fake data only).
// Used when Docker is unavailable (Docker Desktop needs WSL). Data lives in ./.local-pg (git-ignored).
//   node scripts/local-db.mjs        (keep it running in its own terminal)
import fs from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const dir = "./.local-pg/data";
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "unique",
  password: "unique_dev_pw",
  port: 5441,
  persistent: true,
});

const fresh = !fs.existsSync(dir + "/PG_VERSION");
if (fresh) await pg.initialise();
await pg.start();
if (fresh) {
  await pg.createDatabase("unique_dev");
  await pg.createDatabase("unique_test");
}
console.log("Local PostgreSQL ready on localhost:5441 (databases: unique_dev, unique_test). Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
