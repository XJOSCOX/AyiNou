import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(new URL(config.SUPABASE_URL).hostname, `${project}.supabase.co`);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const app = createApp(config);
const users = [];
const slug = randomUUID().slice(0, 8);
const password = `Synthetic-Trust!9-${randomUUID()}`;
const base = "/api/v1/trust";
const own = "/api/v1/me/verification";
const queue = "/api/v1/verification/review";
const ambassadors = process.argv.includes("--ambassadors");

function query(statement) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement],
    { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function fixture(label, mfa = false) {
  const email = `ayinou-trust-${label}-${slug}@example.invalid`;
  const username = `trust_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Trust ${label} ${slug}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const token = login.data.session.access_token;
  Object.assign(user, { client, token, lowToken: token });
  if (mfa) {
    const enrollment = await client.auth.mfa.enroll({ factorType: "totp" });
    assert.ifError(enrollment.error);
    const challenge = await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret),
    });
    assert.ifError(challenge.error);
    user.token = challenge.data.access_token;
  }
  return user;
}

const send = (method, url, user, payload, extra = {}) => app.inject({
  method, url, payload, headers: { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) },
});
async function request(status, method, url, user, payload, extra) {
  const response = await send(method, url, user, payload, extra);
  assert.equal(response.statusCode, status, `${method} ${url}: ${response.headers["content-type"]?.includes("json") ? response.body : "unexpected response"}`);
  return response.body && response.headers["content-type"]?.includes("json") ? response.json() : response;
}

const rationale = "Synthetic fixture written decision.";
const authentication = { rationale, conflictFree: true };

try {
  const applicant = await fixture("applicant");
  const runner = await fixture("reporter");
  const operator = await fixture("operator", true);
  const first = await fixture("first", true);
  const second = await fixture("second", true);
  const independent = await fixture("third", true);
  const fixtures = [operator, first, second, independent].map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
  query(`begin;
    insert into public.role_assignments(user_id,role) select id,'administrator' from auth.users where id='${operator.id}' and email='${operator.email}';
    insert into private.verification_reviewers(user_id) select u.id from auth.users u join (values ${fixtures}) f(id,email)
      on f.id=u.id and f.email=u.email where u.id<>'${operator.id}';
    commit;`);
  const req = await request(201, "POST", own, applicant,
    { kind: "identity", organizationId: null, evidence: ["https://example.invalid/identity-fixture"] });
  const appId = req.id;
  await request(409, "POST", own, applicant, { kind: "identity", organizationId: null, evidence: ["https://example.invalid/identity-fixture"] });
  const available = await request(200, "GET", queue, first);
  const item = available.applications.find(({ id }) => id === appId);
  assert.deepEqual(item.evidence, []);
  assert.equal(item.assignmentRequired, true);
  await request(403, "POST", `${queue}/${appId}`, first, { ...authentication, decision: "approve" });
  await request(403, "PATCH", `${base}/applications/${appId}/assignment`, runner,
    { reviewer: first.username, reason: rationale, assign: true });
  const adminQueue = await request(200, "GET", `${base}/application-assignments`, operator);
  assert.ok(adminQueue.applications.some(({ id }) => id === appId));
  assert.equal(JSON.stringify(adminQueue).includes("identity-fixture"), false);
  await request(204, "PATCH", `${base}/applications/${appId}/assignment`, operator,
    { reviewer: first.username, reason: rationale, assign: true });
  await request(204, "PATCH", `${queue}/${appId}/work`, second, { claim: true });
  const ownedWork = await request(200, "GET", queue + "?status=assigned", first);
  assert.ok(ownedWork.applications.some(({ id, evidence }) => id === appId && evidence.length === 1));
  const decision = (actor, type, expected = 200) => request(expected, "POST", `${queue}/${appId}`, actor, { ...authentication, decision: type });
  assert.equal((await decision(first, "approve")).status, "pending");
  assert.deepEqual((await request(200, "GET", own + "-badge", applicant)).personalClaims, []);
  assert.equal((await request(200, "GET", own, applicant)).applications.find(({ id }) => id === appId).eligibleApprovals, 1);
  assert.equal((await decision(second, "approve")).status, "approved");
  assert.deepEqual((await request(200, "GET", own + "-badge", applicant)).personalClaims, ["identity"]);
  const member = `/api/v1/members/${applicant.username}`;
  if (ambassadors) {
    const operations = "/api/v1/admin/ambassadors";
    const mine = "/api/v1/me/ambassadors";
    const nomination = { username: applicant.username, category: "community", reason: rationale };
    await request(403, "POST", operations, runner, nomination);
    const attempts = await Promise.all([send("POST", operations, operator, nomination), send("POST", operations, operator, nomination)]);
    assert.deepEqual(attempts.map(({ statusCode }) => statusCode).sort(), [201, 409]);
    const id = attempts.find(({ statusCode }) => statusCode === 201).json().id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    const staff = (await request(200, "GET", `${operations}?handle=${applicant.username}`, operator)).cases.find((item) => item.id === id);
    assert.equal(staff.history[0].reason, rationale);
    assert.deepEqual((await request(200, "GET", mine, applicant)).cases, []);
    await request(204, "PATCH", `${operations}/${id}`, operator, { action: "invite", version: 1, reason: rationale });
    assert.deepEqual((await request(200, "GET", mine, runner)).cases, []);
    await request(404, "PATCH", `${mine}/${id}`, runner, { action: "accept", version: 2 });
    const invitation = (await request(200, "GET", mine, applicant)).cases[0];
    assert.equal(invitation.status, "invited");
    assert.ok(!JSON.stringify(invitation).includes(rationale));
    await request(204, "PATCH", `${mine}/${id}`, applicant, { action: "accept", version: 2 });
    await request(409, "PATCH", `${mine}/${id}`, applicant, { action: "accept", version: 2 });
    assert.equal((await request(200, "GET", member + "/ambassador")).ambassador, null);
    const statement = "Synthetic ambassador integration statement.";
    await request(204, "PATCH", `${mine}/${id}`, applicant, { action: "publish", version: 3, publish: true, statement });
    assert.deepEqual((await request(200, "GET", member + "/ambassador")).ambassador, { category: "community", statement });
    const listed = (await request(200, "GET", `/api/v1/ambassadors?q=${applicant.username}&category=community`)).ambassadors;
    assert.deepEqual(listed.map(({ username }) => username), [applicant.username]);
    assert.ok(!JSON.stringify(listed).includes(rationale));
    await request(204, "PATCH", `${operations}/${id}`, operator, { action: "suspend", version: 4, reason: rationale });
    assert.equal((await request(200, "GET", member + "/ambassador")).ambassador, null);
    await request(204, "PATCH", `${operations}/${id}`, operator, { action: "resume", version: 5, reason: rationale });
    assert.equal((await request(200, "GET", member + "/ambassador")).ambassador, null);
    const notifications = (await request(200, "GET", "/api/v1/me/notifications", applicant)).notifications;
    assert.equal(notifications.filter(({ kind }) => kind === "ambassador_invited").length, 1);
    assert.equal(notifications.filter(({ kind }) => kind === "ambassador_updated").length, 3);
    assert.ok(!JSON.stringify(notifications).includes(rationale));
    assert.equal((await request(200, "GET", "/api/v1/me/feed-moderation", applicant)).allowed, false);
    console.log("Hosted ambassador API, concurrent nomination, TOTP, acceptance, publication, suspension and private notices passed.");
  }
  assert.deepEqual((await request(200, "GET", member + "/follow")).personalClaims, ["identity"]);
  const impersonation = { kind: "profile", institution: null, explanation: "Synthetic report with no personal information.", references: ["https://example.invalid/report"] };
  const sent = await request(201, "POST", member + "/impersonation-reports", runner, impersonation);
  await request(409, "POST", member + "/impersonation-reports", runner, impersonation);
  const reports = await request(200, "GET", base + "/impersonation", operator);
  const shown = reports.reports.find(({ id }) => id === sent.id);
  assert.ok(shown);
  assert.ok(!JSON.stringify(shown).includes(runner.id) && !JSON.stringify(shown).includes(runner.username));
  await request(204, "PATCH", `${base}/impersonation/${sent.id}/decision`, operator,
    { outcome: "substantiated", rationale, hold: "identity" });
  assert.equal((await request(200, "GET", member + "/follow")).verified, false);
  await request(200, "GET", "/api/v1/me/profile", applicant);
  assert.equal((await decision(second, "revoke")).status, "revoked");
  const appeal = await request(201, "POST", own + "/appeals", applicant, {
    applicationId: appId, explanation: "Synthetic applicant clarification for review.", references: ["https://example.invalid/explanation"],
  });
  await request(409, "POST", own + "/appeals", applicant, {
    applicationId: appId, explanation: "Synthetic applicant clarification for review.", references: [],
  });
  assert.deepEqual((await request(200, "GET", own + "/appeals", runner)).appeals, []);
  const assignment = `${base}/verification-appeals/${appeal.id}/assignment`;
  await request(404, "PATCH", assignment, operator, { reviewer: first.username, reason: rationale });
  await request(204, "PATCH", assignment, operator, { reviewer: independent.username, reason: rationale });
  const assigned = await request(200, "GET", base + "/verification-appeals?view=assigned", independent);
  assert.ok(assigned.appeals.some(({ id, references }) => id === appeal.id && references.length === 1));
  await request(404, "PATCH", `${base}/verification-appeals/${appeal.id}/decision`, second, { outcome: "upheld", rationale });
  await request(204, "PATCH", `${base}/verification-appeals/${appeal.id}/decision`, independent, { outcome: "reconsideration", rationale });
  assert.equal((await request(200, "GET", own + "/appeals", applicant)).appeals.find(({ id }) => id === appeal.id).outcome, "reconsideration");
  assert.deepEqual((await request(200, "GET", own + "-badge", applicant)).personalClaims, []);
  const notices = (await request(200, "GET", "/api/v1/me/notifications", applicant)).notifications;
  assert.equal(notices.filter(({ kind }) => kind === "verification_appeal_decided").length, 1);
  assert.ok(notices.filter(({ kind }) => kind === "verification_decided").length >= 1);
  assert.ok(!JSON.stringify(notices).includes(rationale) && !JSON.stringify(notices).includes(independent.username));
  console.log("Hosted bootstrap-compatible claims, two real-TOTP reviewers, private impersonation, independent appeals and safe notifications passed.");

  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase5a-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: applicant.email, password, reporter: runner.username, applicant: applicant.username }),
        { mode: 0o600, flag: "wx" });
      console.log("Browser fixture ready. Press Enter to remove the synthetic records.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(file, { force: true });
    }
  }
} finally {
  await app.close();
  if (users.length) {
    const expected = users.map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
    query(`begin; create temporary table trust_fixture_users on commit drop as
      select u.id from auth.users u join (values ${expected}) f(id,email) on u.id=f.id and u.email=f.email;
      ${ambassadors ? `delete from private.ambassador_audit where case_id in (
        select id from private.ambassador_cases where recipient_id in (select id from trust_fixture_users));
      delete from private.ambassador_cases where recipient_id in (select id from trust_fixture_users);` : ""}
      delete from private.impersonation_reports where reporter_id in (select id from trust_fixture_users) and subject_id in (select id from trust_fixture_users);
      delete from private.institution_audit where actor_id in (select id from trust_fixture_users);
      delete from private.verification_applications where applicant_id in (select id from trust_fixture_users);
      delete from public.role_assignments where user_id in (select id from trust_fixture_users);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from trust_fixture_users);
      commit;`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic verification and report fixtures removed.");
}
