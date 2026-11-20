import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const migrations = process.argv.includes("--preflight")
  ? readFileSync("supabase/migrations/20261120080000_phase3b_engagement.sql", "utf8") : "";
const test = readFileSync("supabase/tests/engagement_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-engagement-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n${migrations}\n${test}\nrollback;`, { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Engagement RLS, reply constraints, idempotency, versioning, reactions, moderation and quotas passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
