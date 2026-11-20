import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const migrations = process.argv.includes("--preflight") ? [
  "20261120204000_phase6b_project_operations.sql",
  "20261120205000_phase6b_operations_workflow.sql",
  "20261120206000_phase6b_operations_access.sql",
].map((file) => readFileSync(join("supabase/migrations", file), "utf8")).join("\n") : "";
const test = process.argv.includes("--schema-only") ? "" : readFileSync("supabase/tests/project_work_rollback.sql", "utf8");
const file = join(tmpdir(), "ayinou-project-work-" + randomUUID() + ".sql");
try {
  writeFileSync(file, "begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n" + migrations + "\n" + test + "\nrollback;",
    { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file],
    { encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, [result.error, result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Phase 6B checks passed and were rolled back.");
} finally {
  rmSync(file, { force: true });
}
