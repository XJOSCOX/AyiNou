import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";
import { legalAdminMessages, legalAdminPolicyNames } from "../../web/src/lib/legal-admin-i18n.js";

const admin = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const revoked = "33333333-3333-4333-8333-333333333333";
const draft = { policyId: "terms", state: "draft", enabled: false, revision: 0,
  releaseVersion: null, releaseDigest: null, eligible: false, effectiveAt: null, changedAt: "2026-11-20T00:00:00Z" };
const status = { global: { enabled: false, suspended: false, revision: 0 }, policies: [draft] };

test("legal administration messages and policy names cover all four languages", () => {
  const languages = ["ht", "fr", "en", "es"] as const;
  const keys = Object.keys(legalAdminMessages.en).sort();
  const policies = ["terms", "privacy", "community-guidelines", "organizations", "projects-and-volunteers",
    "voting", "verification", "cookies", "data-rights"];
  for (const language of languages) {
    assert.deepEqual(Object.keys(legalAdminMessages[language]).sort(), keys);
    assert.deepEqual(Object.keys(legalAdminPolicyNames[language]).sort(), policies.slice().sort());
    assert.ok(Object.values(legalAdminMessages[language]).every((value) => value.trim().length > 0));
  }
});

test("legal availability fails closed and rejects invented or unregistered release records", async () => {
  let fail = false;
  const calls: string[] = [];
  const institutions = { async rpc<T>(name: string) {
    calls.push(name);
    if (fail) throw Error("database unavailable");
    return { enabled: true, policies: [{ policyId: "terms", version: "1.0.0", digest: "a".repeat(64) }] } as T;
  } } as unknown as InstitutionRepository;
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { institutions });
  try {
    const read = () => app.inject("/api/v1/legal/availability");
    const first = await read();
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), { enabled: false, policies: [] });
    assert.equal(first.headers["cache-control"], "public, no-store");
    fail = true;
    assert.deepEqual((await read()).json(), { enabled: false, policies: [] });
    assert.deepEqual(calls, ["legal_availability_for_api", "legal_availability_for_api"]);
  } finally { await app.close(); }
});

test("legal management requires current administrator and recent MFA, and activation requires a release", async () => {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const institutions = { async rpc<T>(name: string, input: Record<string, unknown>) {
    calls.push({ name, input });
    if (name === "platform_access_for_api") return { administrator: input.p_actor === admin } as T;
    if (name === "admin_legal_settings_for_api") return status as T;
    if (name === "admin_legal_audit_for_api") return [] as T;
    if (name === "admin_legal_action_for_api") return { revision: 1, enabled: false } as T;
    throw Error("Unexpected RPC");
  } } as unknown as InstitutionRepository;
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    institutions, auth: { async verify(token, requireMfa) {
      if (["member", "organization-owner", "staff"].includes(token)) return member;
      if (token === "revoked") return revoked;
      if (token === "admin") return requireMfa ? null : admin;
      if (token === "mfa") return admin;
      return null;
    } },
  });
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const input = { scope: "policy", policyId: "terms", action: "enable", expectedRevision: 0,
    reason: "Published terms reviewed and approved", requestId: randomUUID(), confirm: "CHANGE LEGAL AVAILABILITY" };
  const action = (token: string, payload: object) => app.inject({ method: "POST", url: "/api/v1/admin/legal/actions",
    headers: headers(token), payload });
  try {
    assert.equal((await app.inject("/api/v1/admin/legal")).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/v1/admin/legal", headers: headers("member") })).statusCode, 403);
    for (const token of ["organization-owner", "staff", "revoked"]) {
      assert.equal((await app.inject({ url: "/api/v1/admin/legal", headers: headers(token) })).statusCode, 403);
    }
    assert.equal((await app.inject({ url: "/api/v1/admin/legal", headers: headers("admin") })).json().error.code, "MFA_REQUIRED");
    const allowed = await app.inject({ url: "/api/v1/admin/legal", headers: headers("mfa") });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.headers["cache-control"], "private, no-store");
    assert.equal(allowed.json().policies[0].eligible, false);
    assert.deepEqual(allowed.json().acceptance, { terms: false, privacyAcknowledgment: false,
      optionalConsent: false, materialNotices: false });
    assert.equal((await action("member", input)).statusCode, 403);
    assert.equal((await action("admin", input)).json().error.code, "MFA_REQUIRED");
    assert.equal((await action("mfa", { ...input, actor: admin })).statusCode, 400);
    assert.equal((await action("mfa", { ...input, confirm: "yes" })).statusCode, 400);
    assert.equal((await action("mfa", input)).json().error.code, "LEGAL_APPROVAL_REQUIRED");
    assert.equal(calls.filter(({ name }) => name === "admin_legal_action_for_api").length, 0);
  } finally { await app.close(); }
});
