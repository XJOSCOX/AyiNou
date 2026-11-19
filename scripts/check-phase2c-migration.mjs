import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
const migration = readFileSync("supabase/migrations/20261119230000_phase2c_accounts.sql", "utf8");
const path = join(tmpdir(), `ayinou-account-preflight-${randomUUID()}.sql`);
const legacy = randomUUID();

try {
  writeFileSync(path, `begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
insert into auth.users (id, email) values ('${legacy}', 'migration-${legacy}@example.invalid');
${migration}
do $$ declare member_code text; referral_code text; begin
  select code into strict member_code from private.member_codes where user_id = '${legacy}';
  select code into strict referral_code from private.referral_codes where user_id = '${legacy}' and retired_at is null;
  if member_code !~ '^M1-[0-9A-F]{32}$' or referral_code !~ '^R1-[0-9A-F]{16}$'
  then raise exception 'unexpected format'; end if;
  if exists (select 1 from public.profiles where user_id = '${legacy}') then raise exception 'backfill changed profiles'; end if;
  perform public.initialize_member_for_api('${legacy}');
  perform public.initialize_member_for_api('${legacy}');
  if public.account_member_code_for_api('${legacy}') <> member_code
    or public.account_referral_code_for_api('${legacy}') <> referral_code then raise exception 'retry changed codes'; end if;
  if exists (select 1 from auth.users u where not u.is_anonymous and u.deleted_at is null and (
    not exists (select 1 from private.member_codes m where m.user_id = u.id) or
    not exists (select 1 from private.referral_codes r where r.user_id = u.id and r.retired_at is null)
  )) then raise exception 'incomplete backfill'; end if;
  if (select count(*) from pg_class where relrowsecurity and oid in (
    'private.member_codes'::regclass, 'private.referral_codes'::regclass, 'private.referrals'::regclass
  )) <> 3 then raise exception 'missing code table RLS'; end if;
  if has_column_privilege('authenticated', 'public.member_private', 'onboarding_step', 'update')
    or has_table_privilege('authenticated', 'public.user_settings', 'insert')
    or has_function_privilege('authenticated', 'public.account_member_code_for_api(uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_referral_for_api(text)', 'execute')
    or has_table_privilege('service_role', 'private.referrals', 'insert')
  then raise exception 'excess grants'; end if;
  if to_regclass('private.verification_challenges') is not null or to_regclass('public.verification_challenges') is not null
  then raise exception 'identity challenges activated out of scope'; end if;
end $$;
rollback;`, { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", "--file", path,
  ], { encoding: "utf8", timeout: 45_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("Phase 2C SQL, legacy backfill, retry and grants: pass (rolled back)");
} finally {
  unlinkSync(path);
}
