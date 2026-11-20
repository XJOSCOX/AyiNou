import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const foundation = process.argv.includes("--preflight");
const migrations = [
  foundation ? "20261120100000_phase3d_recommendations.sql" : null,
  foundation || process.argv.includes("--engagement-preflight") ? "20261120101000_recommendation_engagement_guard.sql" : null,
  foundation || process.argv.includes("--engagement-preflight") || process.argv.includes("--ranking-preflight")
    ? "20261120102000_optimize_recommendation_rank.sql" : null,
].flatMap((file) => file ? [readFileSync(`supabase/migrations/${file}`, "utf8")] : []).join("\n");
const test = readFileSync("supabase/tests/recommendations_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-recommendations-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n${migrations}\n${test}\nrollback;`, { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Recommendation privacy, topic ownership, feedback, snapshot paging, manipulation checks, and the 1,200-post benchmark passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
