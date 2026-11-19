import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const foundationalPreflight = process.argv.includes("--preflight");
const promotionMigration = readFileSync("supabase/migrations/20261120040000_require_verified_administrators.sql", "utf8");
const migration = foundationalPreflight
  ? readFileSync("supabase/migrations/20261120030000_phase2e_administration.sql", "utf8") + "\n" + promotionMigration
  : process.argv.includes("--promotion-preflight") ? promotionMigration : "";
const verificationRegression = readFileSync("supabase/tests/institutions_rollback.sql", "utf8")
  .replace(/^begin;\s*/i, "").replace(/rollback;\s*$/i, "");
const tests = readFileSync("supabase/tests/admin_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-administration-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin;
set local lock_timeout = '3s';
set local statement_timeout = '25s';
${migration}
${tests}
${verificationRegression}
rollback;`, { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Administration, session, audit, independent reviewer and institution SQL checks passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
