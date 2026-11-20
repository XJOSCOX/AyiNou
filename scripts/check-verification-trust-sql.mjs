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
  ? readdirSync(directory).filter((file) => file.includes("_phase5a_")).sort().map((name) => readFileSync(join(directory, name), "utf8")).join("\n") : "";
const test = readFileSync("supabase/tests/verification_trust_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-trust-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n${migrations}\n${test}\nrollback;`,
    { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Trust badges, assignments, reviewer independence, appeals, reporter privacy and notification checks passed (rolled back).");
} finally { rmSync(file, { force: true }); }
