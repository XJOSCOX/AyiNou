import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemberProfile, UpdateMemberProfile } from "@ayinou/shared";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { MemberRepository } from "../src/services/members.js";

const config = readConfig({ LOG_LEVEL: "silent" });
const ownerId = "11111111-1111-4111-8111-111111111111";
const profile: MemberProfile = {
  userId: ownerId,
  displayName: null,
  preferredLocale: "ht",
  isVisible: false,
  residenceCountryCode: null,
  residenceDepartmentCode: null,
  diasporaDepartmentCode: null,
};

function services() {
  const calls: string[] = [];
  const members: MemberRepository = {
    async get(userId, token) { calls.push(`get:${userId}:${token}`); return profile; },
    async update(userId, token, input: UpdateMemberProfile) {
      calls.push(`update:${userId}:${token}`);
      return { ...profile, ...input };
    },
    async departments() { return [{ code: "HT-OU", name: "Ouest" }]; },
    async close() {},
  };
  const auth = { async verify(token: string) { return token === "valid" ? ownerId : null; } };
  return { members, auth, calls };
}

test("protected profile requires a verified bearer token", async () => {
  const app = createApp(config, services());
  try {
    const missing = await app.inject({ method: "GET", url: "/api/v1/me/profile" });
    const invalid = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers: { authorization: "Bearer invalid" } });
    assert.equal(missing.statusCode, 401);
    assert.equal(invalid.statusCode, 401);
    assert.equal(missing.json().error.code, "UNAUTHORIZED");
  } finally { await app.close(); }
});

test("current-user endpoint derives identity from token and rejects privilege fields", async () => {
  const deps = services();
  const app = createApp(config, deps);
  try {
    const headers = { authorization: "Bearer valid" };
    const read = await app.inject({ method: "GET", url: "/api/v1/me/profile", headers });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().profile.userId, ownerId);
    assert.deepEqual(deps.calls, [`get:${ownerId}:valid`]);

    const input: UpdateMemberProfile = {
      displayName: "Ayinou Member", preferredLocale: "fr", residenceCountryCode: "HT",
      residenceDepartmentCode: "HT-OU", diasporaDepartmentCode: null,
    };
    const update = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers, payload: input });
    assert.equal(update.statusCode, 200);
    assert.equal(update.json().profile.displayName, "Ayinou Member");
    assert.deepEqual(deps.calls, [`get:${ownerId}:valid`, `update:${ownerId}:valid`]);

    const forged = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers, payload: { ...input, role: "administrator" } });
    assert.equal(forged.statusCode, 400);
    assert.deepEqual(deps.calls, [`get:${ownerId}:valid`, `update:${ownerId}:valid`]);
  } finally { await app.close(); }
});

test("invalid location combinations are rejected before database access", async () => {
  const deps = services();
  const app = createApp(config, deps);
  try {
    const response = await app.inject({
      method: "PATCH", url: "/api/v1/me/profile", headers: { authorization: "Bearer valid" },
      payload: {
        displayName: "Ayinou Member", preferredLocale: "en", residenceCountryCode: "US",
        residenceDepartmentCode: "HT-OU", diasporaDepartmentCode: null,
      },
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(deps.calls, []);
  } finally { await app.close(); }
});

test("department endpoint remains public and auth service fails closed when unconfigured", async () => {
  const app = createApp(config, services());
  const unconfigured = createApp(config);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/departments" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { departments: [{ code: "HT-OU", name: "Ouest" }] });
    const closed = await unconfigured.inject({ method: "GET", url: "/api/v1/me/profile" });
    assert.equal(closed.statusCode, 503);
  } finally { await app.close(); await unconfigured.close(); }
});

test("account references are not bearer tokens and referral attribution only uses the verified subject", async () => {
  const deps = services();
  const privateCode = `M1-${"A".repeat(32)}`;
  const referralCode = "R1-0123456789ABCDEF";
  deps.members.accounts = {
    async memberCode(userId) { assert.equal(userId, ownerId); return privateCode; },
    async referralCode(userId) { assert.equal(userId, ownerId); return referralCode; },
    async referralSummary(userId) { assert.equal(userId, ownerId); return { confirmedCount: 0 }; },
    async recordReferral(userId) { deps.calls.push(userId); return true; },
    async validateReferral(code) { return code === referralCode; },
  };
  const app = createApp(config, deps);
  try {
    for (const token of [privateCode, referralCode, "123456"]) {
      const denied = await app.inject({ url: "/api/v1/me/member-code", headers: { authorization: `Bearer ${token}` } });
      assert.equal(denied.statusCode, 401);
    }
    const headers = { authorization: "Bearer valid" };
    const read = await app.inject({ url: "/api/v1/me/member-code", headers });
    assert.equal(read.statusCode, 200);
    assert.equal(read.headers["cache-control"], "private, no-store");
    assert.deepEqual(read.json(), { memberCode: privateCode });
    const other = await app.inject({ url: "/api/v1/me/referral-code", headers });
    assert.deepEqual(other.json(), { referralCode });
    const summary = await app.inject({ url: "/api/v1/me/referrals", headers });
    assert.deepEqual(summary.json(), { summary: { confirmedCount: 0 } });
    const url = "/api/v1/me/referrals/attribution";
    for (const payload of [{ userId: ownerId }, { code: referralCode }]) {
      assert.equal((await app.inject({ method: "POST", url, headers, payload })).statusCode, 400);
    }
    assert.deepEqual(deps.calls, []);
    assert.deepEqual((await app.inject({ method: "POST", url, headers })).json(), { attributed: true });
    assert.deepEqual(deps.calls, [ownerId]);

    const validate = (code: string) => app.inject({ method: "POST", url: "/api/v1/referrals/validate", payload: { code } });
    assert.deepEqual((await validate(referralCode.toLowerCase())).json(), { valid: true });
    assert.deepEqual((await validate(privateCode)).json(), { valid: false });
    assert.deepEqual((await validate("123456")).json(), { valid: false });
    for (let i = 0; i < 7; i++) assert.equal((await validate("bad")).statusCode, 200);
    const limited = await validate(referralCode);
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
  } finally { await app.close(); }
});
