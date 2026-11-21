import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Called only by the disposable test runner. No credentials, plaintext dumps or keys are written to disk.
const { AYINOU_E2E_PROJECT: project, AYINOU_E2E_SUPABASE_URL: url,
  AYINOU_E2E_SUPABASE_PUBLIC: publishable, AYINOU_E2E_SUPABASE_SECRET: secret } = process.env;
assert.match(project ?? "", /^ayinou-e2e-[a-f0-9-]{12}$/);
assert.equal(url, "http://127.0.0.1:55321");
assert.ok(publishable && secret);
const source = "postgres";
const restored = "d2_restore_" + randomBytes(6).toString("hex");
const key = randomBytes(32);
const checksum = (data) => createHash("sha256").update(data).digest("hex");
const dockerEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^DOCKER_(HOST|CONTEXT)$/i.test(name)));
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(url, secret, { auth });
const member = createClient(url, publishable, { auth });
const guest = createClient(url, publishable, { auth });

function docker(command, args, input) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_" + project, command, ...args],
    { env: dockerEnv, input, maxBuffer: 32 * 1024 * 1024, timeout: 90_000, windowsHide: true });
  if (result.error) throw new Error(command + " could not run");
  return result;
}

function run(command, args, input) {
  const result = docker(command, args, input);
  if (result.status !== 0) {
    // Only print safe command identifiers, never dump bytes, SQL statements or credentials.
    const code = result.stderr?.toString().match(/\b(?:ERROR|FATAL):\s+([a-zA-Z ]{1,48})/)?.[1]?.trim();
    throw new Error(command + " failed" + (code ? " (" + code + ")" : ""));
  }
  return result.stdout;
}

const sql = (db, query) => run("psql", ["-XqAt", "-U", "supabase_admin", "-d", db, "-v", "ON_ERROR_STOP=1"], query).toString().trim();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ids = Object.fromEntries(["org", "case", "plan", "hold", "project", "poll", "option", "late"]
  .map((name, index) => [name, "d2000000-0000-4000-8000-" + String(index + 1).padStart(12, "0")]));
const pixel = await sharp({ create: { width: 2, height: 2, channels: 3, background: "navy" } }).webp().toBuffer();
const storage = admin.storage.from("member-avatars");
const objectKey = "d2-synthetic/recovery.webp";
const encryption = new Map();

function seal(name, bytes) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(name));
  encryption.set(name, { nonce, body: Buffer.concat([cipher.update(bytes), cipher.final()]),
    tag: cipher.getAuthTag(), sha256: checksum(bytes) });
}

function open(name, replacement) {
  const entry = encryption.get(name);
  const decipher = createDecipheriv("aes-256-gcm", key, entry.nonce);
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(entry.tag);
  const bytes = Buffer.concat([decipher.update(replacement ?? entry.body), decipher.final()]);
  assert.equal(checksum(bytes), entry.sha256);
  return bytes;
}

function check(result, operation) {
  assert.ok(!result.error, operation + " failed");
  return result.data;
}

async function asset(client) {
  const data = check(await client.download(objectKey), "download synthetic object");
  return Buffer.from(await data.arrayBuffer());
}

const email = "d2-synthetic-owner@example.com";
const password = "D2-Disposable!" + randomBytes(16).toString("hex");
const user = check(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create synthetic user").user.id;
const session = check(await member.auth.signInWithPassword({ email, password }), "sign in synthetic user").session;
const sid = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url")).session_id;
assert.match(user, uuid);
assert.match(sid, uuid);
const versionSql = "select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;";
assert.equal(sql(source, "select count(*) || ':' || max(version) from supabase_migrations.schema_migrations where version <= '20261121070000';"), "67:20261121070000");

sql(source, `
  insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${ids.org}','d2-synthetic','D2 synthetic','nonprofit','HT','${user}');
  insert into private.organization_memberships(organization_id,user_id,role) values ('${ids.org}','${user}','owner');
  insert into private.institution_audit(actor_id,organization_id,subject_id,event)
    values ('${user}','${ids.org}','${ids.org}','organization_created');
  insert into private.community_projects(id,creator_id,organization_id,submission_key,request_digest)
    values ('${ids.project}','${user}','${ids.org}',gen_random_uuid(),decode('abcd','hex'));
  insert into private.project_images(project_id,digest,image)
    values ('${ids.project}','${checksum(pixel)}',decode('${pixel.toString("hex")}','hex'));
  insert into private.polls(id,creator_id,request_key,request_digest,scope,kind,policy,audience,eligibility,
    result_policy,title,description,language,opens_at,closes_at)
    values ('${ids.poll}','${user}',gen_random_uuid(),decode('abcd','hex'),'individual','community','advisory','members',
      'active','after_close','Synthetic poll','Disposable data','en',now(),now()+interval '1 day');
  insert into private.poll_options(id,poll_id,position,label) values ('${ids.option}','${ids.poll}',1,'Synthetic');
  insert into private.poll_electorate(poll_id,user_id) values ('${ids.poll}','${user}');
  insert into private.poll_ballots(poll_id,voter_id,option_id) values ('${ids.poll}','${user}','${ids.option}');
  insert into private.privacy_cases(id,subject_id,kind) values ('${ids.case}','${user}','deletion');
  insert into private.lifecycle_plans(id,case_id,version,case_version,request_key,snapshot)
    values ('${ids.plan}','${ids.case}',1,1,gen_random_uuid(),'{}');
  insert into private.lifecycle_holds(id,placed_for_plan,subject_id,placed_by,request_key,scope,resource_ref,reason,policy_version,review_at)
    values ('${ids.hold}','${ids.plan}','${user}','${user}',gen_random_uuid(),'account','d2-fixture',
      'case_evidence',1,now()+interval '1 day');
  insert into private.lifecycle_events(plan_id,actor_id,kind,resource) values ('${ids.plan}','${user}','hold_placed','${ids.hold}');
  insert into private.lifecycle_restore_checks(plan_id,restored_by) values ('${ids.plan}','${user}');
`);
check(await storage.upload(objectKey, pixel, { contentType: "image/webp" }), "seed synthetic object");
seal("storage", await asset(storage));
seal("database", run("pg_dump", ["-U", "supabase_admin", "-d", source, "--format=custom"]));
const corrupt = Buffer.from(encryption.get("database").body);
corrupt[0] ^= 1;
assert.throws(() => open("database", corrupt));

sql(source, `insert into private.institution_audit(id,actor_id,organization_id,subject_id,event)
  values ('${ids.late}','${user}','${ids.org}','${ids.org}','organization_updated');`);
check(await storage.remove([objectKey]), "simulate synthetic object loss");
assert.ok((await storage.download(objectKey)).error, "source object survived loss simulation");

try {
  run("createdb", ["-U", "supabase_admin", "--template=template0", restored]);
  run("pg_restore", ["-U", "supabase_admin", "-d", restored, "--exit-on-error", "--single-transaction"], open("database"));
  assert.equal(sql(restored, versionSql), sql(source, versionSql), "migration history");
  assert.equal(sql(restored, `select private.institution_role('${user}','${ids.org}');`), "owner", "ownership");
  assert.equal(sql(restored, `select count(*) from private.institution_audit where organization_id='${ids.org}';`), "1", "audit");
  assert.equal(sql(source, `select count(*) from private.institution_audit where id='${ids.late}';`), "1", "late write existed");
  assert.equal(sql(restored, `select count(*) from private.institution_audit where id='${ids.late}';`), "0", "detect recovery gap");
  assert.equal(sql(restored, `select encode(image,'hex') from private.project_images where project_id='${ids.project}';`),
    pixel.toString("hex"), "database-backed asset");
  assert.equal(sql(restored, `select count(*) from private.poll_ballots where poll_id='${ids.poll}';`), "1", "ballot intact");
  assert.equal(sql(restored, `select count(*) from private.lifecycle_holds h
    join private.lifecycle_events e on e.resource=h.id and e.kind='hold_placed'
    join private.lifecycle_restore_checks r on r.plan_id=h.placed_for_plan and r.released_at is null
    where h.id='${ids.hold}' and h.released_at is null;`), "1", "hold, audit and quarantine marker");
  assert.equal(sql(restored, "select (public.legal_availability_for_api()->>'enabled');"), "false");
  assert.equal(sql(restored, "select relrowsecurity from pg_class where oid='private.poll_ballots'::regclass;"), "t");
  assert.equal(sql(restored, "select has_function_privilege('service_role','public.organization_intent_for_api(uuid,uuid,boolean)','EXECUTE');"), "t");
  for (const role of ["anon", "authenticated"]) {
    const denial = docker("psql", ["-XqAt", "-U", "supabase_admin", "-d", restored, "-v", "ON_ERROR_STOP=1"],
      `set role ${role}; select count(*) from private.poll_ballots;`);
    assert.notEqual(denial.status, 0);
    assert.match(denial.stderr.toString(), /permission denied/);
  }
  assert.equal(sql(restored, `select count(*) from auth.sessions where id='${sid}' and user_id='${user}';`), "1");
  sql(restored, `delete from auth.sessions where id='${sid}' and user_id='${user}';`);
  assert.equal(sql(restored, `select count(*) from auth.sessions where id='${sid}';`), "0", "explicit session invalidation");

  assert.equal(sql(restored, `select count(*) from storage.objects where bucket_id='member-avatars' and name='${objectKey}';`), "1",
    "database snapshot retained metadata after object-byte loss");
  check(await storage.upload(objectKey, open("storage"), { contentType: "image/webp" }), "restore synthetic object through Storage API");
  assert.equal(checksum(await asset(storage)), checksum(pixel), "restored object bytes");
  for (const client of [guest, member]) {
    assert.ok((await client.storage.from("member-avatars").download(objectKey)).error, "private direct download denied");
  }
  console.log("D2 recovered a synthetic database and a private Storage object. Integrity, grants, ownership, audit, holds, session invalidation and recovery-gap checks passed.");
} finally {
  key.fill(0);
  encryption.clear();
  run("dropdb", ["-U", "supabase_admin", "--if-exists", restored]);
}
