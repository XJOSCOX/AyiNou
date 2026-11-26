import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { expect } from "./fixtures";

const source = "postgres";

export function disposableDatabaseCommand(command: string, args: string[], input?: string | Buffer) {
  const project = process.env.AYINOU_E2E_PROJECT;
  if (!/^ayinou-e2e-[a-f0-9-]{12}$/.test(project ?? "") ||
      process.env.AYINOU_E2E_SUPABASE_URL !== "http://127.0.0.1:55321") {
    throw new Error("Recovery rehearsal must use the disposable Supabase runner");
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^DOCKER_(HOST|CONTEXT)$/i.test(key)) delete env[key];
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_" + project, command, ...args],
    { env, input, maxBuffer: 64 * 1024 * 1024, timeout: 90_000, windowsHide: true });
  if (result.error || result.status !== 0) {
    const error = result.stderr?.toString().match(/\b(?:ERROR|FATAL):\s+([a-zA-Z ]{1,48})/)?.[1]?.trim();
    throw new Error(command + " failed" + (error ? " (" + error + ")" : ""));
  }
  return result.stdout;
}

export const rehearsalSql = (query: string, db = source) => disposableDatabaseCommand("psql",
  ["-XqAt", "-U", "supabase_admin", "-d", db, "-v", "ON_ERROR_STOP=1"], query).toString().trim();

const recoveryTables = [
  "private.community_projects", "private.project_images", "private.c14_links", "private.c21_outcome_requests",
  "private.c22_findings", "private.c22_challenges", "private.c23_publications", "private.c23_disclosures",
  "private.c24_mappings", "private.c24_releases", "private.c24_events",
];

const integrity = recoveryTables.map((table) =>
  `select '${table}',count(*),md5(string_agg(to_jsonb(r)::text,'' order by to_jsonb(r)::text)) from ${table} r`).join(" union all ");

export function verifyImpactRecovery() {
  const restored = "c25_restore_" + randomBytes(6).toString("hex");
  const snapshot = rehearsalSql(integrity);
  const manifest = rehearsalSql("select count(*)||':'||max(version) from supabase_migrations.schema_migrations;");
  const backup = disposableDatabaseCommand("pg_dump", ["-U", "supabase_admin", "-d", source, "--format=custom"]);
  const checksum = createHash("sha256").update(backup).digest("hex");
  disposableDatabaseCommand("createdb", ["-U", "supabase_admin", "--template=template0", restored]);
  try {
    disposableDatabaseCommand("pg_restore", ["-U", "supabase_admin", "-d", restored, "--exit-on-error", "--single-transaction"], backup);
    expect(rehearsalSql(integrity, restored)).toBe(snapshot);
    expect(rehearsalSql("select count(*)||':'||max(version) from supabase_migrations.schema_migrations;", restored)).toBe(manifest);
    expect(rehearsalSql(`select not private.c24_enabled()
      and not exists(select from private.c21_outcome_fixture)
      and not exists(select from private.c22_fixture)
      and not exists(select from private.c23_fixture)
      and not exists(select from private.c24_fixture)
      and (select count(*)>0 from private.c24_releases where state='suppressed')
      and (select count(*)>0 from private.c23_publications where state='invalidated')
      and (select relrowsecurity from pg_class where oid='private.c24_releases'::regclass)
      and not has_table_privilege('authenticated','private.c24_releases','select')
      and not has_function_privilege('anon','public.c24_impact_for_api(integer,text,text)','execute')
      and has_function_privilege('service_role','public.c24_impact_for_api(integer,text,text)','execute');`, restored)).toBe("t");
    expect(rehearsalSql(`select public.c24_impact_for_api(2025,'education','national')->>'state';`, restored)).toBe("disabled");
    console.log("C2 disposable backup and isolated restore verified", backup.length, "bytes; SHA-256", checksum);
  } finally {
    disposableDatabaseCommand("dropdb", ["-U", "supabase_admin", "--if-exists", restored]);
    backup.fill(0);
  }
}
