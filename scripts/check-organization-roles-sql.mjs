import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ref = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, ref);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
const migrations = process.argv.includes("--preflight") ? [
  "20261120190000_phase5d_organization_roles.sql", "20261120191000_phase5d_operational_access.sql", "20261120192000_phase5d_role_notifications.sql",
].map((file) => readFileSync(join("supabase/migrations", file), "utf8")).join("\n") : "";
const test = readFileSync("supabase/tests/organization_roles_rollback.sql", "utf8");
const file = join(tmpdir(), "ayinou-role-check-" + randomUUID() + ".sql");
try {
  writeFileSync(file, "begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n" + migrations + "\n" + test + "\nrollback;",
    { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, [result.error, result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Custom role scope, MFA, delegation, lifecycle, notices and RLS passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
