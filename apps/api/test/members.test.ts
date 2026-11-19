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
    async get(userId) { calls.push(`get:${userId}`); return profile; },
    async update(userId, input: UpdateMemberProfile) {
      calls.push(`update:${userId}`);
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
    assert.deepEqual(deps.calls, [`get:${ownerId}`]);

    const input: UpdateMemberProfile = {
      displayName: "Ayinou Member", preferredLocale: "fr", residenceCountryCode: "HT",
      residenceDepartmentCode: "HT-OU", diasporaDepartmentCode: null,
    };
    const update = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers, payload: input });
    assert.equal(update.statusCode, 200);
    assert.equal(update.json().profile.displayName, "Ayinou Member");
    assert.deepEqual(deps.calls, [`get:${ownerId}`, `update:${ownerId}`]);

    const forged = await app.inject({ method: "PATCH", url: "/api/v1/me/profile", headers, payload: { ...input, role: "administrator" } });
    assert.equal(forged.statusCode, 400);
    assert.deepEqual(deps.calls, [`get:${ownerId}`, `update:${ownerId}`]);
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
