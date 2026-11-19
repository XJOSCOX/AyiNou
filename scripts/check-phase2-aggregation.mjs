import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
const projectRef = process.env.AYINOU_HOSTED_TEST_PROJECT_REF;
assert.equal(new URL(config.SUPABASE_URL).hostname, `${projectRef}.supabase.co`);
assert.equal(projectRef, "hcbxulyfmdmuyccgrujs");
assert.match(config.SUPABASE_SECRET_KEY ?? "", /^sb_secret_/);

const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const app = createApp(config);
const ids = [];
const tempSql = join(tmpdir(), `ayinou-phase2-fixture-${randomUUID()}.sql`);
const runId = randomUUID().slice(0, 12);
const password = `AyinouFixture${randomUUID().replaceAll("-", "").slice(0, 16)}9`;

function assertNoError(result, label) { assert.ifError(result.error, label); }

function runScenario(label, expected) {
  const { departmentCode, departmentMembers, countryCode, countryMembers, ...fields } = expected;
  const quotedIds = ids.map((id) => {
    assert.match(id, /^[0-9a-f-]{36}$/);
    return `'${id}'::uuid`;
  }).join(",");
  const checks = Object.entries(fields).map(([key, value]) =>
    value === null
      ? `if s->>'${key}' is not null then raise exception '${label}: ${key} should be hidden'; end if;`
      : `if s->>'${key}' is distinct from '${value}' then raise exception '${label}: ${key} was %, expected ${value}', s->>'${key}'; end if;`
  ).join("\n");
  const groupChecks = [
    departmentCode ? `if (select (value->>'members')::bigint from jsonb_array_elements(s->'departments') value where value->>'code' = '${departmentCode}') <> ${departmentMembers} then raise exception '${label}: department grouping'; end if;` : "",
    countryCode ? `if (select (value->>'members')::bigint from jsonb_array_elements(s->'diasporaCountries') value where value->>'code' = '${countryCode}') <> ${countryMembers} then raise exception '${label}: country grouping'; end if;` : "",
  ].join("\n");
  const sql = `begin;
delete from public.member_metric_exclusions where user_id in (${quotedIds});
do $$ declare s jsonb; begin
  s := private.build_community_stats();
  ${checks}
  ${groupChecks}
  if s->>'geographyAvailable' = 'true' then
    if jsonb_array_length(s->'departments') <> 10 then
      raise exception '${label}: expected ten department rows';
    end if;
  end if;
end $$;
rollback;`;
  writeFileSync(tempSql, sql, { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", tempSql,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  console.log(`${label}: pass (transaction rolled back)`);
}

try {
  const baseline = await app.inject("/api/v1/community/stats");
  assert.equal(baseline.statusCode, 200);
  assert.equal(baseline.json().stats.registered, 0, "fixture test requires an empty eligible-member baseline");

  for (let index = 0; index < 10; index++) {
    const email = `ayinou-phase2-fixture+${runId}-${index}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assertNoError(created, "create synthetic Auth user");
    const id = created.data.user?.id;
    assert.ok(id);
    ids.push(id);
    assertNoError(await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" }), "exclude synthetic user");
    assertNoError(await admin.rpc("initialize_member_for_api", { p_user_id: id }), "initialize synthetic profile");
  }
  assertNoError(await admin.from("member_private").update({ residence_country_code: "HT", residence_department_code: "HT-OU" }).in("user_id", ids), "set Haiti residence");
  assertNoError(await admin.from("user_activity_daily").insert({ user_id: ids[0], activity_day: new Date().toISOString().slice(0, 10) }), "record one active user");

  runScenario("Haiti department and small active cohort", {
    registered: 10, haiti: 10, diaspora: 0, unknown: 0,
    representedDepartments: 1, geographyAvailable: true, active: null, verified: 0,
    departmentCode: "HT-OU", departmentMembers: 10,
  });

  assertNoError(await admin.from("user_activity_daily").insert(ids.slice(1).map((id) => ({ user_id: id, activity_day: new Date().toISOString().slice(0, 10) }))), "record remaining active users");
  assertNoError(await admin.from("verification_records").insert(ids.map((id) => ({
    user_id: id, verification_type: "identity", status: "verified", reviewed_by: ids[0], verified_at: new Date().toISOString(),
  }))), "create synthetic approved records");
  runScenario("active and approved verification", {
    registered: 10, haiti: 10, diaspora: 0, unknown: 0,
    representedDepartments: 1, geographyAvailable: true, active: 10, verified: 10,
  });

  assertNoError(await admin.from("member_private").update({ residence_country_code: "US", residence_department_code: null }).in("user_id", ids), "set diaspora residence");
  runScenario("diaspora country grouping", {
    registered: 10, haiti: 0, diaspora: 10, unknown: 0,
    representedDepartments: 0, geographyAvailable: true, active: 10, verified: 10,
    countryCode: "US", countryMembers: 10,
  });

  assertNoError(await admin.from("member_private").update({ residence_country_code: null, residence_department_code: null }).in("user_id", ids), "clear residence");
  runScenario("undisclosed location", {
    registered: 10, haiti: 0, diaspora: 0, unknown: 10,
    representedDepartments: 0, geographyAvailable: true, active: 10, verified: 10,
  });

  assertNoError(await admin.from("member_private").update({ residence_country_code: "HT", residence_department_code: "HT-ND" }).eq("user_id", ids[0]), "create small geographic cohort");
  runScenario("complementary geographic suppression", {
    registered: 10, haiti: null, diaspora: null, unknown: null,
    representedDepartments: null, geographyAvailable: false, active: 10, verified: 10,
    departments: null, diasporaCountries: null,
  });

  const after = await app.inject("/api/v1/community/stats");
  assert.equal(after.json().stats.registered, 0, "excluded fixtures entered public totals");
  console.log("public metrics excluded all synthetic fixtures: pass");
} finally {
  await app.close();
  try { unlinkSync(tempSql); } catch { /* File may not have been written. */ }
  const failures = [];
  for (const id of ids.reverse()) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) failures.push(id);
  }
  if (failures.length) throw new Error(`Synthetic account cleanup failed for ${failures.length} IDs`);
  console.log(`cleanup: completed for ${ids.length} known synthetic users`);
}
