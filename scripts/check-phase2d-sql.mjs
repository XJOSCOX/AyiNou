import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const migration = process.argv.includes("--preflight")
  ? readFileSync("supabase/migrations/20261120010000_phase2d_institutions.sql", "utf8")
  : "";
const tests = readFileSync("supabase/tests/institutions_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-institutions-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin;
set local lock_timeout = '3s';
set local statement_timeout = '25s';
${migration}
${tests}
rollback;`, { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("Institution grants, private contacts, role scope, invitation replay/expiry, reviews, ownership transfer, and revocation passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
