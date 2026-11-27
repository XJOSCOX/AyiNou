import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const tester = "5fd294ec-af26-49da-ac4a-039b9b5a5c92";
const other = "0a2c5050-a91c-4ef7-ae3a-928b3b1078bb";
const env = {
  RENDER: "true", NODE_ENV: "production", PORT: "10000", AYINOU_API_MODE: "render-dev", LOG_LEVEL: "silent",
  SUPABASE_URL: "https://hcbxulyfmdmuyccgrujs.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "fixture-public", SUPABASE_SECRET_KEY: "fixture-private",
  AYINOU_RENDER_TEST_USER_IDS: tester, AYINOU_RENDER_PROXY_CIDRS: "127.0.0.0/8",
};
const https = { host: "api-dev.ayinou.com", "x-forwarded-proto": "https" };
const bearer = { ...https, authorization: "Bearer ey.test.signature" };

const closed = { enabled: false, mode: "closed", individualEnabled: false, organizationEnabled: false };
function setup(initial: unknown = closed, hold?: Promise<void>) {
  let verified = 0;
  let checked = 0;
  let policy = initial;
  const unused = () => Promise.reject(new Error("Unexpected repository operation"));
  const institutions: InstitutionRepository = {
    publicProfile: unused, accounts: unused, manage: unused, logo: unused,
    async rpc<T>(name: string): Promise<T> {
      assert.equal(name, "registration_policy_for_api");
      checked++;
      if (policy instanceof Error) throw policy;
      return policy as T;
    },
  };
  const app = createApp(readConfig(env), {
    institutions,
    readBudget: async (category) => assert.equal(category, "profile"),
    auth: {
      async verify(token) {
        verified++;
        await hold;
        return token === "ey.test.signature" ? tester : token === "ey.other.signature" ? other : null;
      },
      async ownAccountRestriction() { return null; },
      async verifyRestrictedAccount(token) {
        if (token === "ey.restricted.signature") return { actor: tester, restriction: "suspended" };
        if (token === "ey.outsideRestriction.signature") return { actor: other, restriction: "banned" };
        return null;
      },
    },
  });
  return { app, counts: () => ({ verified, checked }), setPolicy: (value: unknown) => { policy = value; } };
}

test("Render refuses missing, invalid and unsafe configuration while local defaults remain", () => {
  const config = readConfig({ ...env, API_HOST: "127.0.0.1", API_PORT: "3000" });
  assert.equal(config.API_HOST, "0.0.0.0");
  assert.equal(config.API_PORT, 10000);
  assert.deepEqual(config.WEB_ORIGINS, []);
  assert.deepEqual(config.renderDevelopment?.testUserIds, [tester]);
  assert.equal(readConfig({ API_PORT: "4300" }).API_HOST, "127.0.0.1");
  assert.equal(readConfig({ API_PORT: "4300" }).API_PORT, 4300);
  for (const override of [
    { AYINOU_API_MODE: undefined }, { AYINOU_RENDER_TEST_USER_IDS: "" }, { AYINOU_RENDER_TEST_USER_IDS: "Test02" },
    { AYINOU_RENDER_TEST_USER_IDS: tester + "," + tester }, { PORT: "18012" },
    { PORT: undefined }, { AYINOU_RENDER_PROXY_CIDRS: "0.0.0.0/0" }, { AYINOU_RENDER_PROXY_CIDRS: undefined }, { NODE_ENV: "development" }, { SUPABASE_URL: "https://unexpected.supabase.co" },
    { SUPABASE_SECRET_KEY: undefined }, { AYINOU_COMMUNITY_NEEDS: "pilot" },
    { AYINOU_MENTORSHIP_PROFILES: "synthetic" }, { AYINOU_VOLUNTEER_MATCHING: "synthetic" },
    { AYINOU_IMPACT_REPORTING: "synthetic" }, { AYINOU_FOUNDER_BOOTSTRAP_ENABLED: "true" },
    { AYINOU_RENDER_PROXY_CIDRS: "127.0.0.1/32" }, { AYINOU_RENDER_PROXY_CIDRS: "10.0.0.0/8" },
    { AYINOU_RENDER_PROXY_CIDRS: "127.0.0.0/8,::1/128" },
  ]) assert.throws(() => readConfig({ ...env, ...override }), /Invalid API environment/);
});

test("health is cheap and public; alternate hosts, privileged routes and writes stay closed", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  const health = await app.inject({ url: "/health", headers: { host: https.host } });
  assert.equal(health.statusCode, 200);
  assert.equal((await app.inject({ url: "/health", headers: { host: "alternate.invalid" } })).statusCode, 404);
  assert.equal(health.headers["cache-control"], "private, no-store");
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.headers["x-frame-options"], "DENY");
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
  for (const url of ["/api/v1/registration/policy", "/api/v1/me/founder-bootstrap", "/api/v1/admin/overview",
    "/api/v1/administrator-activation/anything", "/api/v1/me/private-workflows/anything/admin",
    "/api/v1/me/community-needs", "/api/v1/me/mentorship", "/api/v1/me/volunteer-matches", "/api/v1/impact",
    "/api/v1/projects/review", "/api/v1/projects/example?preview=review",
    "/api/v1/posts/example/attachments/image/image?review=true", "/health?next=/api/v1/admin/overview"]) {
    assert.equal((await app.inject({ url, headers: bearer })).statusCode, 404, url);
  }
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"] as const) {
    assert.equal((await app.inject({ method, url: "/api/v1/me/profile", headers: bearer })).statusCode, 404);
  }
  assert.equal((await app.inject({ url: "/api/v1/status", headers: {
    ...bearer, host: "ayinou-api-dev.onrender.com", "x-forwarded-host": "api-dev.ayinou.com",
  } })).statusCode, 404);
  assert.equal((await app.inject({ url: "/api/v1/status", headers: { ...bearer, "x-forwarded-proto": "https, http" } })).statusCode, 403);
  assert.equal((await app.inject({ url: "/api/v1/status", headers: bearer, remoteAddress: "198.51.100.77" })).statusCode, 403);
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
});

test("only live allowlisted accounts can read, and reopening shared registration closes access", async (t) => {
  const { app, setPolicy, counts } = setup();
  t.after(() => app.close());
  const url = "/api/v1/status";
  assert.equal((await app.inject({ url, headers: https })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: { ...https, authorization: "Bearer ey.expired.signature" } })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: { ...https, authorization: "Bearer ey.other.signature" } })).statusCode, 403);
  assert.deepEqual(counts(), { verified: 2, checked: 0 });
  const response = await app.inject({ url, headers: { ...bearer, origin: "https://ayinou.com" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["strict-transport-security"], "max-age=31536000");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  for (const policy of [{ enabled: true, mode: "public" }, { enabled: true, mode: "invitation_only" },
    null, { enabled: "false", mode: "closed" }, Error("upstream unavailable")]) {
    setPolicy(policy);
    assert.equal((await app.inject({ url, headers: bearer })).statusCode, 503);
  }
  setPolicy({ ...closed, individualEnabled: true });
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 503);
  setPolicy({ ...closed, organizationEnabled: true });
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 503);
  setPolicy(closed);
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 200);
});

test("unverified client address metadata uses the same conservative quota", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  for (let index = 0; index < 60; index++) {
    const address = [undefined, `192.0.2.${index}`, "192.0.2.1, 192.0.2.2", "malformed", "::ffff:192.0.2.1"][index % 5];
    const response = await app.inject({
      url: "/api/v1/status", headers: { ...https, "x-forwarded-for": `192.0.2.${index}, 198.51.100.10`,
        ...(address === undefined ? {} : { "cf-connecting-ip": address }) },
    });
    assert.equal(response.statusCode, 401);
  }
  const response = await app.inject({ url: "/api/v1/status", headers: {
    ...bearer, "x-forwarded-for": "203.0.113.20, 198.51.100.10",
  } });
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "60");
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
  assert.equal((await app.inject({ url: "/health", headers: { host: https.host } })).statusCode, 200);
});

test("recognizes HTTPS scheme casing only from the immediate trusted peer", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  const url = "/api/v1/status";
  for (const peer of ["127.0.0.1", "127.2.3.4", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    const accepted = await app.inject({ url, remoteAddress: peer, headers: { ...https, "x-forwarded-proto": " HTTPS " } });
    assert.equal(accepted.statusCode, 401, peer);
    assert.equal(accepted.headers["strict-transport-security"], "max-age=31536000");
  }
  for (const sample of [
    { peer: "198.51.100.77", scheme: "https" },
    { peer: "::1", scheme: "https" },
    { peer: "::ffff:198.51.100.77", scheme: "https" },
    { peer: "127.0.0.1", scheme: "http, https" },
    { peer: "127.0.0.1", scheme: "https, https" },
    { peer: "127.0.0.1", scheme: "https, http" },
    { peer: "127.0.0.1", scheme: "https, unknown" },
  ]) {
    const denied = await app.inject({
      url, remoteAddress: sample.peer, headers: { ...bearer, "x-forwarded-proto": sample.scheme },
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.headers["strict-transport-security"], undefined);
  }
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
});

test("standing permits only a live allowlisted restricted member and excludes other reads", async (t) => {
  const { app } = setup();
  t.after(() => app.close());
  const url = "/api/v1/me/account-standing";
  const restricted = { ...https, authorization: "Bearer ey.restricted.signature" };
  const result = await app.inject({ url: url + "?subject=" + other, headers: restricted });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), { restriction: "suspended" });
  assert.equal(result.headers["cache-control"], "private, no-store");
  assert.equal((await app.inject({ url: "/api/v1/me/profile", headers: restricted })).statusCode, 401);
  assert.equal((await app.inject({ method: "PATCH", url, headers: restricted })).statusCode, 404);
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: https })).statusCode, 401);
  for (const name of ["revoked", "expired", "mfaRequired"]) {
    assert.equal((await app.inject({ url, headers: { ...https, authorization: `Bearer ey.${name}.signature` } })).statusCode, 401);
  }
  assert.equal((await app.inject({ url, headers: { ...https, authorization: "Bearer ey.outsideRestriction.signature" } })).statusCode, 403);
});

test("Render limits concurrency and releases capacity after a response", async (t) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const { app, counts } = setup(closed, pending);
  t.after(() => app.close());
  const url = "/api/v1/status";
  const held = Array.from({ length: 12 }, () => app.inject({ url, headers: bearer }));
  try {
    for (let tick = 0; tick < 100 && counts().verified !== 12; tick++) {
      await new Promise((done) => setImmediate(done));
    }
    assert.equal(counts().verified, 12);
    assert.equal((await app.inject({ url, headers: bearer })).statusCode, 429);
  } finally {
    release();
    await Promise.all(held);
  }
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 200);
});
