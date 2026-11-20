import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const directory = "supabase/migrations";
const migrations = process.argv.includes("--preflight")
  ? readdirSync(directory).filter((file) => file.includes("_phase4c_")).sort().map((name) => readFileSync(join(directory, name), "utf8")).join("\n") : "";
const test = readFileSync("supabase/tests/community_recommendations_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-community-recommendations-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n${migrations}\n${test}\nrollback;`,
    { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  const timing = /"benchmark_ms"\s*:\s*"?(\d+)/.exec(result.stdout)?.[1];
  assert.ok(timing, "The rollback query did not report a benchmark");
  console.log(`1,200-group first page: ${timing} ms inside PostgreSQL.`);
  console.log("Recommendation ranking, privacy, feedback, cursor, My Communities and permissions passed (rolled back).");
} finally { rmSync(file, { force: true }); }
