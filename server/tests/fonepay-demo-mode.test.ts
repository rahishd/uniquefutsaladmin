import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

// The Fonepay mode rules live in src/config/env.ts and run when it is imported, so each case starts a fresh process with its own settings.
const root = path.join(__dirname, "..");
function load(extra: Record<string, string>): { ok: boolean; out: string } {
  const env = {
    PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "",
    DATABASE_URL: "postgresql://u:p@db.example.com/prod?sslmode=require", ADMIN_JWT_SECRET: "x".repeat(40), ...extra,
  };
  try {
    const out = execFileSync(process.execPath, ["--import", "tsx", "-e", "const {env}=require('./src/config/env');console.log(JSON.stringify({mode:env.FONEPAY_MODE,allow:env.ALLOW_TEST_PAYMENTS}))"], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}

describe("Fonepay test mode on a deployed server", () => {
  it("is refused in production by default", () => {
    const r = load({ NODE_ENV: "production", FONEPAY_MODE: "test" });
    assert.equal(r.ok, false);
    assert.match(r.out, /not allowed in production/);
    assert.match(r.out, /ALLOW_TEST_PAYMENTS=true/);
  });

  it("is allowed in production only with the explicit demo switch", () => {
    const r = load({ NODE_ENV: "production", FONEPAY_MODE: "test", ALLOW_TEST_PAYMENTS: "true" });
    assert.equal(r.ok, true, r.out);
    assert.deepEqual(JSON.parse(r.out.trim().split("\n").pop()!), { mode: "test", allow: true });
  });

  it("any other value of the switch does not count", () => {
    for (const v of ["1", "yes", "TRUE", "false", ""]) {
      assert.equal(load({ NODE_ENV: "production", FONEPAY_MODE: "test", ALLOW_TEST_PAYMENTS: v }).ok, false, `value "${v}"`);
    }
  });

  it("the demo switch cannot be combined with live mode", () => {
    const r = load({ NODE_ENV: "production", FONEPAY_MODE: "live", ALLOW_TEST_PAYMENTS: "true", FONEPAY_MERCHANT_CODE: "m", FONEPAY_SECRET: "s", FONEPAY_BASE_URL: "https://x.example" });
    assert.equal(r.ok, false);
    assert.match(r.out, /needs FONEPAY_MODE=test/);
  });

  it("live mode in production still works without the switch", () => {
    const r = load({ NODE_ENV: "production", FONEPAY_MODE: "live" });
    assert.equal(r.ok, true, r.out);
    assert.deepEqual(JSON.parse(r.out.trim().split("\n").pop()!), { mode: "live", allow: false });
  });
});
