import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { makeExportPackage, sealExport, unsealExport } from "../src/services/privacy-export-package.js";

const binding = { subject: "subject", caseId: "case", artifact: "artifact" };
const generated = "2026-11-20T12:00:00Z";
const projection = {
  profile: [{ locale: "en", publicProfile: false }], residence: [], preferences: [], interests: [],
  posts: [], comments: [], affiliations: [], privacyRequests: [], pollParticipation: [{ hasParticipated: true }],
};

test("export package is deterministic, bounded and explicitly field allowlisted", () => {
  const raw = { ...projection, interests: Array.from({ length: 101 }, () => "education") };
  const bytes = makeExportPackage(raw, generated);
  assert.deepEqual(makeExportPackage(raw, generated), bytes);
  const data = JSON.parse(bytes.toString("utf8"));
  const interests = data.manifest.categories.find((category: { category: string }) => category.category === "interests");
  assert.equal(interests.truncated, true);
  assert.equal(interests.count, 100);
  assert.equal(interests.sha256, createHash("sha256").update(JSON.stringify(data.data.interests)).digest("hex"));
  assert.throws(() => makeExportPackage({ ...raw, interests: [...raw.interests, "peace"] }, generated));
  assert.throws(() => makeExportPackage({ ...raw, pollParticipation: [{ hasParticipated: true, optionId: "excluded" }] }, generated));
  assert.throws(() => makeExportPackage({ ...raw, profile: [{ locale: "en", publicProfile: false, email: "excluded" }] }, generated));
  assert.throws(() => makeExportPackage({ ...raw, comments: undefined }, generated));
});

test("authenticated encryption protects artifact, case, subject, version and ciphertext integrity", () => {
  const key = randomBytes(32);
  const wrongKey = randomBytes(32);
  const bytes = makeExportPackage(projection, generated);
  const first = sealExport(key, binding, bytes);
  assert.notEqual(first.slice(0, 24), sealExport(key, binding, bytes).slice(0, 24));
  assert.deepEqual(unsealExport(key, binding, 1, first), bytes);
  assert.throws(() => unsealExport(wrongKey, binding, 1, first));
  assert.throws(() => unsealExport(key.subarray(1), binding, 1, first));
  assert.throws(() => unsealExport(key, binding, 2, first));
  for (const field of ["subject", "caseId", "artifact"] as const) {
    assert.throws(() => unsealExport(key, { ...binding, [field]: "substituted" }, 1, first));
  }
  assert.throws(() => unsealExport(key, binding, 1, first.slice(0, -2) + (first.endsWith("aa") ? "bb" : "aa")));
  assert.throws(() => unsealExport(key, binding, 1, first.slice(1)));
});

test("export is disabled by default and a missing synthetic key fails closed", async (t) => {
  const route = "/api/v1/me/privacy-exports/availability";
  const auth = {
    async verify() { return "fixture"; },
    async verifySession() { return { actor: "fixture", session: "fixture", aal2: false }; },
  };
  for (const config of [readConfig({ LOG_LEVEL: "silent" }), readConfig({
    LOG_LEVEL: "silent", SUPABASE_URL: "https://example.invalid", AYINOU_PRIVACY_INTAKE: "synthetic",
    AYINOU_PRIVACY_EXPORT: "synthetic",
  })]) {
    const app = createApp(config, { auth });
    t.after(() => app.close());
    const reply = await app.inject(route);
    assert.equal(reply.statusCode, 404);
    assert.equal(reply.json().error.code, "PRIVACY_EXPORT_DISABLED");
    assert.equal(reply.headers["cache-control"], "private, no-store");
  }
  const app = createApp(readConfig({
    LOG_LEVEL: "silent", SUPABASE_URL: "http://127.0.0.1:55321", AYINOU_PRIVACY_INTAKE: "synthetic",
    AYINOU_PRIVACY_EXPORT: "synthetic", AYINOU_PRIVACY_EXPORT_TEST_KEY: "invalid",
  }), { auth });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: route, headers: { authorization: "Bearer fixture" } })).statusCode, 503);
});
