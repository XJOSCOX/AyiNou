import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import sharp from "sharp";
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
const password = `Synthetic-Project!9-${randomUUID()}`;
const base = "/api/v1/projects";

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
  const email = `ayinou-project-${label}-${slug}@example.invalid`;
  const username = `project_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Project ${label} ${slug}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const token = login.data.session.access_token;
  Object.assign(user, { token });
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


const title = `Synthetic proposal ${slug}`;
const narrative = "Community members will coordinate a synthetic education proposal.";
const proposal = {
  title, description: narrative, problem: narrative, solution: narrative, objectives: narrative,
  beneficiaries: narrative, outcomes: narrative, category: "education", country: "HT", department: "HT-OU",
  startDate: null, endDate: null, references: ["https://example.invalid/proposal"], publishRequested: true,
};

try {
  const applicant = await fixture("author", true);
  const plainMember = await fixture("draft");

  const headers = { "idempotency-key": randomUUID() };
  const body = { kind: "individual", owner: null, association: null, proposal };
  const [first, second] = await Promise.all([
    request(201, "POST", base, applicant, body, headers),
    request(201, "POST", base, applicant, body, headers),
  ]);
  assert.equal(first.id, second.id);
  const path = base + "/" + first.id;
  await request(404, "GET", path);
  await request(404, "GET", path, plainMember);

  const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#226599" } }).png().toBuffer();
  const uploaded = await request(200, "PUT", path + "/image", applicant, { version: 1, image: image.toString("base64") });
  assert.equal(uploaded.version, 2);
  const cover = await request(200, "GET", path + "/image", applicant);
  assert.equal((await sharp(cover.rawPayload).metadata()).format, "webp");
  await request(404, "GET", path + "/image");
  await request(409, "PATCH", path, applicant, { version: 1, proposal, removeImage: false });
  const denied = await request(403, "POST", path + "/submit", applicant, { version: 2 });
  assert.equal(denied.error.code, "PROJECT_IDENTITY_REQUIRED");
  assert.equal((await request(200, "GET", path, applicant)).submissionIdentity, "required");
  const revised = await request(200, "PATCH", path, applicant, {
    version: 2, proposal: { ...proposal, title: title + " revised" }, removeImage: false,
  });
  assert.equal(revised.version, 3);
  const plainDraft = await request(201, "POST", base, plainMember, body, { "idempotency-key": randomUUID() });
  const plainPath = base + "/" + plainDraft.id;
  const plainDenied = await request(403, "POST", plainPath + "/submit", plainMember, { version: 1 });
  assert.equal(plainDenied.error.code, "PROJECT_IDENTITY_REQUIRED");
  if (process.argv.includes("--work")) {
    await request(401, "GET", "/api/v1/me/project-work");
    const index = await request(200, "GET", "/api/v1/me/project-work", plainMember);
    assert.ok(!index.work.some((item) => item.id === plainDraft.id));
    await request(404, "GET", plainPath + "/work", plainMember);
    await request(404, "POST", plainPath + "/work", plainMember, { action: "execution_status", status: "active", version: 0 });
    console.log("Hosted Phase 6B API passed bearer-only work reads and draft activation denial.");
  }

  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase6a1-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: plainMember.email, password, project: plainDraft.id, title }), { mode: 0o600, flag: "wx" });
      console.log("Phase 6A.1 browser fixture ready. Press Enter to continue and clean up.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(file, { force: true });
    }
  }

  await request(201, "POST", "/api/v1/me/verification", plainMember, {
    kind: "identity", organizationId: null, evidence: ["https://example.invalid/project-identity-fixture"],
  });
  const latest = await request(200, "GET", plainPath, plainMember);
  const pending = await request(403, "POST", plainPath + "/submit", plainMember, { version: latest.version });
  assert.equal(pending.error.code, "PROJECT_IDENTITY_PENDING");
  const detail = await request(200, "GET", plainPath, plainMember);
  assert.equal(detail.submissionIdentity, "pending");
  assert.equal(detail.canSubmit, false);
  assert.ok(!JSON.stringify(detail).includes("project-identity-fixture"));
  await request(404, "GET", plainPath);
  const list = await request(200, "GET", base + "?category=education&country=HT&department=HT-OU");
  assert.ok(!list.projects.some((item) => item.id === plainDraft.id || item.id === first.id));
  console.log("Hosted project API passed concurrent draft creation, private media, confirmed-email and MFA-only denial, and pending identity privacy.");
} finally {
  await app.close();
  if (users.length) {
    const expected = users.map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
    query(`begin; create temporary table project_fixture_users on commit drop as
      select u.id from auth.users u join (values ${expected}) f(id,email) on u.id=f.id and u.email=f.email;
      delete from private.verification_applications where applicant_id in (select id from project_fixture_users);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from project_fixture_users);
      commit;`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic project accounts and their proposals removed.");
}
