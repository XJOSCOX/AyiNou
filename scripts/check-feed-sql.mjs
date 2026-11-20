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
  foundation ? "20261120070000_phase3a_text_feed.sql" : null,
  foundation || process.argv.includes("--publication-preflight") ? "20261120071000_feed_publication_time.sql" : null,
].flatMap((name) => name ? [readFileSync(`supabase/migrations/${name}`, "utf8")] : []).join("\n");
const test = readFileSync("supabase/tests/feed_rollback.sql", "utf8");
const file = join(tmpdir(), `ayinou-feed-${randomUUID()}.sql`);
try {
  writeFileSync(file, `begin; set local lock_timeout='3s'; set local statement_timeout='25s';\n${migrations}\n${test}\nrollback;`, { mode: 0o600, flag: "wx" });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", file,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  console.log("Feed RLS, idempotency, version checks, moderation, report privacy, and account/write limits passed (rolled back).");
} finally {
  rmSync(file, { force: true });
}
