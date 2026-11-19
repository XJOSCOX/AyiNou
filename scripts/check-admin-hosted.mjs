import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const project = "hcbxulyfmdmuyccgrujs";
dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${project}.supabase.co`);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const server = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const app = createApp(config);
const run = randomUUID();
const password = `Synthetic-Ayinou!9-${randomUUID()}`;
const users = [];
let primary;
let applicationId;

function sql(statement) {
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, "Guarded synthetic SQL did not complete");
}

async function fixture(label) {
  const email = `ayinou-2e-${run}-${label}@example.invalid`;
  const { data, error } = await server.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  const id = data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const user = { id, email, client, token: null };
  users.push(user);
  assert.ifError((await server.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  user.token = login.data.session.access_token;
  return user;
}

function totp(secret) {
  const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")].map((character) => {
    const value = base32.indexOf(character);
    assert.ok(value >= 0);
    return value.toString(2).padStart(5, "0");
  }).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function elevate(user) {
  const mfa = user.client.auth.mfa;
  const enrollment = await mfa.enroll({ factorType: "totp" });
  assert.ifError(enrollment.error);
  const elevated = await mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) });
  assert.ifError(elevated.error);
  user.token = elevated.data.access_token;
  const { data: checked, error } = await user.client.auth.getClaims(user.token);
  assert.ifError(error);
  const claims = checked.claims;
  const result = await server.rpc("account_session_for_api", {
    p_user: user.id, p_session: claims.session_id, p_aal2: claims.aal === "aal2", p_privileged: true,
  });
  assert.ifError(result.error);
  assert.equal(result.data, true, "Elevated token is not bound to an active verified authenticator");
  assert.ok(claims.amr?.some((entry) => ["totp", "mfa/totp"].includes(entry.method)), "Missing signed TOTP method");
}

async function send(method, url, status, user, payload) {
  const headers = user && { authorization: `Bearer ${user.token}` };
  const result = await app.inject({ method, url, headers, payload });
  assert.equal(result.statusCode, status, `${method} ${url}: ${result.statusCode === status ? "" : result.body}`);
  return result.body ? result.json() : null;
}

try {
  primary = await fixture("admin");
  const target = await fixture("member");
  const reviewer = await fixture("reviewer");
  sql(`insert into public.role_assignments(user_id,role)
    select id,'administrator' from auth.users where id='${primary.id}' and email='${primary.email}';`);
  const base = "/api/v1/admin";
  await send("GET", `${base}/overview`, 401);
  await send("GET", `${base}/overview`, 403, target);
  assert.equal((await send("GET", `${base}/overview`, 403, primary)).error.code, "MFA_REQUIRED");
  await elevate(primary);
  const overview = await send("GET", `${base}/overview`, 200, primary);
  assert.ok(Object.values(overview).every((count) => Number.isInteger(count) && count >= 0));
  const search = await send("GET", `${base}/accounts?q=${target.id}`, 200, primary);
  assert.deepEqual(search.accounts.map((account) => account.id), [target.id]);
  assert.ok(!("email" in search.accounts[0]) && !("residenceCountryCode" in search.accounts[0]));
  const reason = "Synthetic security regression test";
  const action = (actor, subject, status, body) => send("PATCH", `${base}/accounts/${subject.id}`, status, actor, { ...body, reason });
  await action(target, target, 403, { action: "grant", value: "administrator" });
  await action(primary, primary, 403, { action: "revoke", value: "administrator" });
  await action(primary, target, 400, { action: "grant", value: "administrator", actorId: target.id });
  await action(primary, target, 409, { action: "grant", value: "administrator" });
  const originalToken = target.token;
  await send("GET", "/api/v1/me/profile", 200, target);
  await action(primary, target, 204, { action: "status", value: "suspended" });
  assert.equal(target.token, originalToken);
  await send("GET", "/api/v1/me/profile", 401, target);
  await send("GET", "/api/v1/me/affiliations", 401, target);
  const direct = await target.client.rpc("account_session_active");
  assert.ifError(direct.error);
  assert.equal(direct.data, false);
  assert.ok((await target.client.from("member_private").select("user_id").eq("user_id", target.id)).data?.length === 0);
  await action(primary, target, 204, { action: "status", value: "banned" });
  await send("GET", "/api/v1/me/profile", 401, target);
  await action(primary, target, 204, { action: "status", value: "active" });
  await send("GET", "/api/v1/me/profile", 200, target);
  await elevate(reviewer);
  await action(primary, reviewer, 204, { action: "grant", value: "moderator" });
  await action(primary, reviewer, 204, { action: "revoke", value: "moderator" });
  await action(primary, reviewer, 204, { action: "grant", value: "verification_reviewer" });
  assert.equal((await action(primary, reviewer, 409, { action: "grant", value: "administrator" })).error.code, "VERIFICATION_REQUIRED");
  assert.equal((await send("GET", `${base}/accounts?q=${reviewer.id}`, 200, primary)).accounts[0].verified, false);
  assert.ifError((await server.from("verification_records").insert({
    user_id: reviewer.id, verification_type: "identity", status: "verified", reviewed_by: primary.id, verified_at: new Date().toISOString(),
  })).error);
  assert.equal((await send("GET", `${base}/accounts?q=${reviewer.id}`, 200, primary)).accounts[0].verified, true);
  await action(primary, reviewer, 204, { action: "grant", value: "administrator" });
  await send("GET", `${base}/overview`, 200, reviewer);
  await action(primary, reviewer, 204, { action: "revoke", value: "administrator" });
  await send("GET", `${base}/overview`, 403, reviewer);
  await send("GET", `${base}/overview`, 403, reviewer);
  await send("GET", "/api/v1/verification/review", 403, primary);
  const applicant = await send("POST", "/api/v1/me/verification", 201, target, {
    kind: "identity", organizationId: null, evidence: ["https://example.invalid/synthetic"],
  });
  applicationId = applicant.id;
  assert.match(applicationId, /^[0-9a-f-]{36}$/);
  const queue = "/api/v1/verification/review";
  await send("PATCH", `${queue}/${applicationId}/work`, 204, reviewer, { claim: true });
  const assigned = await send("GET", `${queue}?status=assigned`, 200, reviewer);
  assert.ok(assigned.applications.some((item) => item.id === applicationId && item.assignedToMe));
  const review = { decision: "approve", rationale: reason, conflictFree: true };
  assert.equal((await send("POST", `${queue}/${applicationId}`, 200, reviewer, review)).status, "pending");
  await send("POST", `${queue}/${applicationId}`, 409, reviewer, review);
  const audit = await send("GET", `${base}/audit`, 200, primary);
  assert.ok(audit.events.some((event) => event.subjectId === target.id && event.event === "account_suspended"));
  assert.ok(audit.events.some((event) => event.subjectId === reviewer.id && event.role === "verification_reviewer" && event.event === "role_granted"));
  assert.ok(audit.events.some((event) => event.subjectId === applicationId && event.event === "approval_recorded"));
  assert.ifError((await target.client.auth.signOut({ scope: "global" })).error);
  await send("GET", "/api/v1/me/profile", 401, target);
  console.log("Hosted administration, real TOTP, live-token suspension, independent review work, audit, and global logout passed.");
} finally {
  await app.close();
  if (users.length) {
    const fixtureIds = users.map(({ id }) => `'${id}'`).join(",");
    const emailPattern = `ayinou-2e-${run}-%@example.invalid`;
    sql(`begin;
      delete from public.verification_records where user_id in (select id from auth.users where id in (${fixtureIds}) and email like '${emailPattern}');
      delete from private.institution_audit where actor_id in (select id from auth.users where id in (${fixtureIds}) and email like '${emailPattern}');
      delete from private.platform_admin_audit where actor_id in (select id from auth.users where id in (${fixtureIds}) and email like '${emailPattern}');
      delete from public.role_assignments where user_id in (select id from auth.users where id in (${fixtureIds}) and email like '${emailPattern}');
      commit;`);
    const results = await Promise.all(users.map(({ id }) => server.auth.admin.deleteUser(id)));
    assert.ok(results.every(({ error }) => !error), "synthetic account cleanup failed");
    console.log("Synthetic administration fixtures removed.");
  }
}
