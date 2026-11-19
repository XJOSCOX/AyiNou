import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

dotenv.config({ path: "apps/api/.env", quiet: true });
const projectRef = process.env.AYINOU_HOSTED_TEST_PROJECT_REF;
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.match(projectRef ?? "", /^[a-z]{20}$/);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${projectRef}.supabase.co`);
assert.match(config.SUPABASE_PUBLISHABLE_KEY ?? "", /^sb_publishable_/);
assert.match(config.SUPABASE_SECRET_KEY ?? "", /^sb_secret_/);

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const publicClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
const app = createApp(config);
const createdIds = [];
const cleanupErrors = [];
const runId = randomUUID().slice(0, 12);
const password = `AyinouTest${randomUUID().replaceAll("-", "").slice(0, 16)}9`;

function memberClient() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
}

function expectDenied(result, label) {
  assert.ok(result.error, `${label} unexpectedly succeeded`);
}

try {
  const health = await app.inject({ method: "GET", url: "/health" });
  const status = await app.inject({ method: "GET", url: "/api/v1/status" });
  const departments = await app.inject({ method: "GET", url: "/api/v1/departments" });
  assert.equal(health.statusCode, 200);
  assert.equal(status.statusCode, 200);
  assert.equal(departments.statusCode, 200);
  assert.equal(departments.json().departments.length, 10);
  console.log("health/status/departments: pass");

  const ids = [];
  const clients = [];
  const sessions = [];
  for (const index of [1, 2]) {
    const email = `ayinou-hosted-test+${runId}-${index}@example.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    assert.ifError(createError);
    assert.ok(created.user?.id);
    createdIds.push(created.user.id);
    ids.push(created.user.id);
    const client = memberClient();
    const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
    assert.ifError(loginError);
    assert.ok(login.session?.access_token);
    clients.push(client);
    sessions.push(login.session);
  }
  console.log("synthetic account login: pass");

  const badLogin = await memberClient().auth.signInWithPassword({
    email: `ayinou-hosted-test+${runId}-1@example.invalid`, password: `${password}wrong`,
  });
  expectDenied(badLogin, "invalid login");

  const unauthorized = await app.inject({ method: "GET", url: "/api/v1/me/profile" });
  const malformed = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers: { authorization: "Bearer invalid" } });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(malformed.statusCode, 401);
  console.log("invalid credentials / missing or malformed token: pass");

  const bearer = { authorization: `Bearer ${sessions[0].access_token}` };
  const initial = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers: bearer });
  assert.equal(initial.statusCode, 200, initial.body);
  assert.equal(initial.json().profile.userId, ids[0]);
  assert.equal(initial.json().profile.isVisible, false);

  const input = {
    displayName: "Hosted Test Member", preferredLocale: "fr", residenceCountryCode: "HT",
    residenceDepartmentCode: "HT-OU", diasporaDepartmentCode: null,
  };
  const saved = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers: bearer, payload: input });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().profile.displayName, input.displayName);
  const reloaded = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers: bearer });
  assert.equal(reloaded.json().profile.residenceDepartmentCode, "HT-OU");
  console.log("profile initialization / atomic update / reload: pass");

  const [foreignPublic, foreignPrivate, anonymousPublic, anonymousPrivate] = await Promise.all([
    clients[1].from("profiles").select("user_id").eq("user_id", ids[0]),
    clients[1].from("member_private").select("user_id").eq("user_id", ids[0]),
    publicClient.from("profiles").select("user_id").eq("user_id", ids[0]),
    publicClient.from("member_private").select("user_id").eq("user_id", ids[0]),
  ]);
  assert.deepEqual(foreignPublic.data, []);
  assert.deepEqual(foreignPrivate.data, []);
  assert.deepEqual(anonymousPublic.data, []);
  assert.ok(anonymousPrivate.error || !anonymousPrivate.data?.length);

  const forged = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers: bearer, payload: { ...input, role: "administrator" } });
  assert.equal(forged.statusCode, 400);
  expectDenied(await clients[0].from("role_assignments").insert({ user_id: ids[0], role: "administrator" }), "self role assignment");
  expectDenied(await clients[0].from("verification_records").insert({ user_id: ids[0], verification_type: "identity", status: "verified" }), "self verification");
  expectDenied(await publicClient.rpc("initialize_member_for_api", { p_user_id: ids[0] }), "anonymous initialization");
  const [roles, verifications] = await Promise.all([
    admin.from("role_assignments").select("user_id").eq("user_id", ids[0]),
    admin.from("verification_records").select("user_id").eq("user_id", ids[0]),
  ]);
  assert.deepEqual(roles.data, []);
  assert.deepEqual(verifications.data, []);
  console.log("RLS, private data, and privilege escalation: pass");

  const { data: refreshed, error: refreshError } = await clients[0].auth.refreshSession(sessions[0]);
  assert.ifError(refreshError);
  assert.ok(refreshed.session?.access_token);
  const refreshedRequest = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers: { authorization: `Bearer ${refreshed.session.access_token}` } });
  assert.equal(refreshedRequest.statusCode, 200);
  assert.ifError((await clients[0].auth.signOut()).error);
  const revoked = await memberClient().auth.refreshSession({ refresh_token: refreshed.session.refresh_token });
  expectDenied(revoked, "revoked refresh token");
  console.log("session refresh / logout revocation: pass");

  const languageFiles = ["ht", "fr", "en"].map((locale) => JSON.parse(readFileSync(`apps/web/src/messages/auth/${locale}.json`, "utf8")));
  const keys = Object.keys(languageFiles[0]).sort();
  for (const messages of languageFiles) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((value) => typeof value === "string" && value.length > 0));
  }
  console.log("ht/fr/en auth dictionaries: pass");

  console.log("public registration, email confirmation, password reset: not executed (controlled deliverable email required)");
  console.log("real token expiry: not executed (hosted JWT lifetime not shortened)");
} finally {
  await app.close();
  for (const id of createdIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) cleanupErrors.push(`Synthetic user ${id}: ${error.message}`);
  }
  if (cleanupErrors.length) throw new Error(`Hosted test cleanup failed: ${cleanupErrors.join("; ")}`);
  console.log(`cleanup: completed for ${createdIds.length} known synthetic user(s)`);
}
