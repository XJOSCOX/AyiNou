import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

dotenv.config({ path: "apps/api/.env", quiet: true });
const ref = "hcbxulyfmdmuyccgrujs";
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, ref);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${ref}.supabase.co`);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const publicClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
const app = createApp(config);
const users = [];
const run = randomUUID().slice(0, 12);
const password = `AyinouSynthetic9-${randomUUID()}`;
const handle = `institution-hosted-${run}`;
let org;

async function fixture(label) {
  const email = `institution-${run}-${label}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  users.push(id);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  const username = `${label}_${run.replaceAll("-", "")}`;
  assert.ifError((await admin.from("profiles").update({ username, display_name: "Synthetic institution member" }).eq("user_id", id)).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { id, client, username, headers: { authorization: `Bearer ${login.data.session.access_token}` } };
}

async function send(method, url, expected, user, payload) {
  const response = await app.inject({ method, url, headers: user?.headers, payload });
  assert.equal(response.statusCode, expected, `${method} ${url}`);
  return response.body ? response.json() : undefined;
}

try {
  const [owner, editor, stranger] = [await fixture("owner"), await fixture("editor"), await fixture("stranger")];
  const root = "/api/v1/institutions";
  const created = await send("POST", root, 201, owner, {
    name: "Synthetic municipality", handle, kind: "municipality", countryCode: "HT", departmentCode: "HT-OU",
    description: null, website: "https://example.invalid", contactEmail: "private@example.invalid",
  });
  org = created.id;
  assert.match(org, /^[0-9a-f-]{36}$/);
  const detail = `${root}/${org}`;
  const publicRoute = `${root}/by-handle/${handle}`;
  const initial = await send("GET", publicRoute, 200);
  assert.equal(initial.organization.verificationStatus, "unverified");
  assert.equal(initial.organization.departmentCode, "HT-OU");
  assert.ok(!("contactEmail" in initial.organization) && !("logoAsset" in initial.organization));
  await send("GET", detail, 403, stranger);
  assert.equal((await send("GET", detail, 200, owner)).contactEmail, "private@example.invalid");
  assert.ok((await stranger.client.schema("private").from("organizations").select("id")).error);
  assert.ok((await stranger.client.schema("private").from("verification_evidence").select("url")).error);
  assert.ok((await stranger.client.rpc("institution_manage_for_api", { p_actor: owner.id, p_org: org })).error);
  assert.ok((await publicClient.rpc("institution_public_for_api", { p_handle: handle })).error);
  console.log("Hosted client grants and public projection privacy: pass");

  const invite = await send("POST", `${detail}/invitations`, 201, owner, { username: editor.username, role: "editor", termDays: 2 });
  const accept = `/api/v1/institution-invitations/${invite.id}/accept`;
  await send("POST", accept, 403, stranger);
  const inbox = await send("GET", "/api/v1/me/institution-accounts", 200, editor);
  assert.equal(inbox.invitations[0]?.id, invite.id);
  await send("POST", accept, 204, editor);
  await send("POST", accept, 409, editor);
  assert.equal((await send("GET", detail, 200, editor)).contactEmail, null);
  await send("PATCH", detail, 200, editor, { description: "Synthetic editor change" });
  await send("PATCH", detail, 403, editor, { name: "Forbidden identity edit" });
  await send("PATCH", detail, 400, owner, { verificationStatus: "verified" });
  const img = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#225eab" } }).png().toBuffer();
  assert.ok((await editor.client.storage.from("institution-logos").upload(`${org}/unauthorized.webp`, img)).error);
  await send("POST", `${detail}/logo`, 204, editor, { image: img.toString("base64") });
  const afterLogo = await send("GET", publicRoute, 200);
  assert.ok(afterLogo.organization.logoUrl);
  const derivative = await fetch(afterLogo.organization.logoUrl);
  assert.equal(derivative.status, 200);
  assert.equal((await sharp(Buffer.from(await derivative.arrayBuffer())).metadata()).format, "webp");
  const member = (await send("GET", detail, 200, owner)).representatives.find((entry) => entry.username === editor.username);
  await send("POST", `${detail}/representatives/${member.id}/revoke`, 204, owner);
  await send("GET", detail, 403, editor);
  console.log("Bound invitation acceptance, scoped edits, private logo upload and revocation: pass");

  const verification = "/api/v1/me/verification";
  const input = { kind: "government", organizationId: org, evidence: ["https://example.invalid/registry"] };
  await send("POST", verification, 403, stranger, input);
  const application = await send("POST", verification, 201, owner, input);
  assert.equal(application.status, "pending");
  assert.equal((await send("GET", verification, 200, stranger)).applications.length, 0);
  assert.equal((await send("GET", verification, 200, owner)).applications[0]?.id, application.id);
  await send("GET", "/api/v1/verification/review", 403, owner);
  assert.equal((await send("GET", publicRoute, 200)).organization.verificationStatus, "unverified");
  console.log("Application privacy, restricted review, and no automatic badge: pass");
} finally {
  await app.close();
  assert.ok(users.every((id) => /^[0-9a-f-]{36}$/.test(id)));
  if (org) {
    const bucket = admin.storage.from("institution-logos");
    const listed = await bucket.list(org);
    assert.ifError(listed.error);
    const paths = listed.data.map(({ name }) => `${org}/${name}`);
    if (paths.length) assert.ifError((await bucket.remove(paths)).error);
    const sql = `begin; delete from private.institution_audit where organization_id='${org}';
      delete from private.organizations where id='${org}' and handle='${handle}' and created_by='${users[0]}'; commit;`;
    const cleared = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", sql],
      { encoding: "utf8", timeout: 30_000 });
    assert.equal(cleared.status, 0, "fixture organization cleanup failed");
  }
  const cleaned = await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
  assert.ok(cleaned.every(({ error }) => !error), "synthetic member cleanup failed");
  console.log("Synthetic fixture cleanup complete");
}
