import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

dotenv.config({ path: "apps/api/.env", quiet: true });
const ref = "hcbxulyfmdmuyccgrujs";
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, ref);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${ref}.supabase.co`);
assert.match(config.SUPABASE_SECRET_KEY ?? "", /^sb_secret_/);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const asVisitor = () => createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
const app = createApp(config);
const ids = [];
const password = `AyinouSynthetic9-${randomUUID()}`;
const prefix = "/api/v1/me";

async function fixture(referralCode) {
  const email = `ayinou-accounts-${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true, ...(referralCode ? { user_metadata: { referral_code: referralCode } } : {}),
  });
  assert.ifError(created.error);
  const id = created.data.user.id;
  ids.push(id);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  const client = asVisitor();
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { client, id, email, token: login.data.session.access_token };
}

async function request(user, path, method = "GET", payload) {
  return app.inject({
    method, url: `${prefix}/${path}`, payload,
    ...(user ? { headers: { authorization: `Bearer ${user.token}` } } : {}),
  });
}

async function get(user, path) {
  const response = await request(user, path);
  assert.equal(response.statusCode, 200, path);
  return response.json();
}

async function denied(operation, label) {
  assert.ok((await operation).error, label);
}

function currentTotp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()].map((character) => {
    const index = alphabet.indexOf(character);
    assert.notEqual(index, -1);
    return index.toString(2).padStart(5, "0");
  }).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

try {
  const sponsor = await fixture();
  const [codes, referrals] = await Promise.all([
    Promise.all(Array.from({ length: 4 }, () => get(sponsor, "member-code"))),
    Promise.all(Array.from({ length: 4 }, () => get(sponsor, "referral-code"))),
  ]);
  const [{ memberCode }] = codes;
  const [{ referralCode }] = referrals;
  assert.match(memberCode, /^M1-[0-9A-F]{32}$/);
  assert.match(referralCode, /^R1-[0-9A-F]{16}$/);
  assert.ok(codes.every((value) => value.memberCode === memberCode));
  assert.ok(referrals.every((value) => value.referralCode === referralCode));

  const alternate = await fixture();
  const { referralCode: alternateCode } = await get(alternate, "referral-code");
  const { memberCode: alternateMemberCode } = await get(alternate, "member-code");
  assert.ok(alternateCode !== referralCode && alternateMemberCode !== memberCode);
  assert.equal((await request(null, "member-code")).statusCode, 401);
  for (const token of [memberCode, referralCode, "123456"]) {
    assert.equal((await request({ token }, "member-code")).statusCode, 401);
  }

  const validate = (code) => app.inject({ method: "POST", url: "/api/v1/referrals/validate", payload: { code } });
  assert.deepEqual((await validate(referralCode.toLowerCase())).json(), { valid: true });
  assert.deepEqual((await validate(memberCode)).json(), { valid: false });
  assert.deepEqual((await validate("123456")).json(), { valid: false });
  await denied(asVisitor().rpc("validate_referral_for_api", { p_code: referralCode }), "anonymous direct referral lookup");
  await denied(alternate.client.rpc("account_member_code_for_api", { p_user_id: sponsor.id }), "cross-user member-code RPC");
  await denied(alternate.client.schema("private").from("member_codes").select("code"), "private schema exposure");
  await denied(alternate.client.rpc("record_signup_referral_for_api", { p_user_id: sponsor.id }), "direct attribution RPC");
  console.log("concurrent initialization, unique code formats, and code separation: pass");

  const referred = await fixture(referralCode.toLowerCase());
  assert.ifError((await referred.client.auth.updateUser({ data: { referral_code: alternateCode } })).error);
  assert.ifError((await alternate.client.auth.updateUser({ data: { referral_code: alternateCode } })).error);
  assert.equal((await request(referred, "referrals/attribution", "POST", { userId: sponsor.id, code: alternateCode })).statusCode, 400);
  assert.deepEqual((await request(alternate, "referrals/attribution", "POST")).json(), { attributed: false });
  const records = await Promise.all(Array.from({ length: 4 }, () => request(referred, "referrals/attribution", "POST")));
  for (const record of records) {
    assert.equal(record.statusCode, 200);
    assert.deepEqual(record.json(), { attributed: true });
  }
  assert.deepEqual(await get(sponsor, "referrals"), { summary: { confirmedCount: 1 } });
  assert.deepEqual(await get(alternate, "referrals"), { summary: { confirmedCount: 0 } });
  const initialized = await get(referred, "profile");
  assert.equal(initialized.profile.userId, referred.id);
  assert.ok(!("memberCode" in initialized.profile) && !("referralCode" in initialized.profile));
  assert.equal(sponsor.id === referred.id, false);
  console.log("signup-only referral attribution, late/self claim denial, and replay safety: pass");

  await denied(referred.client.from("member_private").update({ onboarding_step: 4 }).eq("user_id", referred.id), "direct stage bypass");
  await denied(referred.client.from("profiles").update({ display_name: "Direct write", username: "direct_write" }).eq("user_id", referred.id), "direct profile edit");
  await denied(referred.client.from("user_settings").upsert({ user_id: referred.id, discoverable: true }), "direct settings write");
  await denied(referred.client.from("member_interests").insert({ user_id: referred.id, interest_code: "education" }), "direct interests write");
  await denied(referred.client.from("role_assignments").insert({ user_id: referred.id, role: "administrator" }), "role escalation");
  await denied(referred.client.from("verification_records").insert({ user_id: referred.id, verification_type: "identity" }), "badge escalation");
  for (const p_changes of [
    { onboardingStep: 4, firstName: "Test", lastName: "Member", membershipCategory: "haitian" },
    { discoverable: true },
    { onboardingStep: "1" },
    { role: "administrator" },
    { displayName: null },
  ]) await denied(referred.client.rpc("save_member_profile_v2", { p_changes }), "profile RPC validation");
  assert.equal((await get(referred, "profile")).profile.onboardingStep, 0);
  const saved = await request(referred, "profile/details", "PATCH", { firstName: "Test", lastName: "Member", membershipCategory: "haitian", onboardingStep: 1 });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().profile.onboardingStep, 1);
  console.log("direct PostgREST writes, stage skipping, visibility and privilege boundaries: pass");

  const setup = await referred.client.auth.mfa.enroll({ factorType: "totp", issuer: "AyiNou tests" });
  assert.ifError(setup.error);
  const factorId = setup.data.id;
  const verify = async (client) => {
    const result = await client.auth.mfa.challengeAndVerify({ factorId, code: currentTotp(setup.data.totp.secret) });
    assert.ok(!result.error, "synthetic TOTP verification failed");
    return result.data.access_token;
  };
  const elevatedToken = await verify(referred.client);
  const lowerClient = asVisitor();
  const lower = await lowerClient.auth.signInWithPassword({ email: referred.email, password });
  assert.ifError(lower.error);
  const lowerToken = lower.data.session.access_token;
  assert.equal((await request({ token: lowerToken }, "member-code")).statusCode, 401);
  assert.equal((await request({ token: elevatedToken }, "member-code")).statusCode, 200);
  const restricted = await lowerClient.from("member_private").select("first_name").eq("user_id", referred.id);
  assert.ifError(restricted.error);
  assert.deepEqual(restricted.data, []);
  await denied(lowerClient.rpc("save_member_profile_v2", { p_changes: { preferredLocale: "fr" } }), "AAL1 profile write");
  assert.ifError((await referred.client.auth.mfa.unenroll({ factorId })).error);
  console.log("Supabase TOTP enrollment, AAL2/API access, AAL1/RLS denial and removal: pass");
} finally {
  await app.close();
  const cleanup = await Promise.all(ids.reverse().map((id) => admin.auth.admin.deleteUser(id)));
  assert.ok(cleanup.every(({ error }) => !error), "synthetic fixture cleanup failed");
}
