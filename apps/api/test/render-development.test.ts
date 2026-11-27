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
  AYINOU_RENDER_TEST_USER_IDS: tester, AYINOU_RENDER_PROXY_CIDRS: "127.0.0.1/32",
};
const https = { host: "api-dev.ayinou.com", "x-forwarded-proto": "https" };
const bearer = { ...https, authorization: "Bearer ey.test.signature" };

function setup(initial: unknown = { enabled: false, mode: "closed" }, overrides: NodeJS.ProcessEnv = {}) {
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
  const app = createApp(readConfig({ ...env, ...overrides }), {
    institutions,
    auth: {
      async verify(token) {
        verified++;
        return token === "ey.test.signature" ? tester : token === "ey.other.signature" ? other : null;
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
    { AYINOU_RENDER_INGRESS_PROBE_KEY: "invalid" },
  ]) assert.throws(() => readConfig({ ...env, ...override }), /Invalid API environment/);
});

test("health is cheap and public; alternate hosts, privileged routes and writes stay closed", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  const health = await app.inject("/health");
  assert.equal(health.statusCode, 200);
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
  setPolicy({ enabled: true, mode: "closed" });
  assert.equal((await app.inject({ url, headers: bearer })).statusCode, 200);
});

test("client-supplied forwarded addresses do not evade the per-address limit", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  for (let index = 0; index < 60; index++) {
    const response = await app.inject({
      url: "/api/v1/status", headers: { ...https, "x-forwarded-for": `192.0.2.${index}, 198.51.100.10` },
    });
    assert.equal(response.statusCode, 401);
  }
  const response = await app.inject({ url: "/api/v1/status", headers: {
    ...bearer, "x-forwarded-for": "203.0.113.20, 198.51.100.10",
  } });
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "60");
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
  assert.equal((await app.inject("/health")).statusCode, 200);
});

test("recognizes HTTPS scheme casing only from the immediate trusted peer", async (t) => {
  const { app, counts } = setup();
  t.after(() => app.close());
  const url = "/api/v1/status";
  for (const peer of ["127.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    const accepted = await app.inject({ url, remoteAddress: peer, headers: { ...https, "x-forwarded-proto": " HTTPS " } });
    assert.equal(accepted.statusCode, 401, peer);
    assert.equal(accepted.headers["strict-transport-security"], "max-age=31536000");
  }
  for (const sample of [
    { peer: "198.51.100.77", scheme: "https" },
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

test("temporary probe requires its key, keeps responses unchanged and bounds private logging", async (t) => {
  const key = "c".repeat(64);
  const { app, counts } = setup(undefined, { AYINOU_RENDER_INGRESS_PROBE_KEY: key });
  t.after(() => app.close());
  const logged = t.mock.method(app.log, "info", () => undefined);
  const probes = () => logged.mock.calls.map((call) => call.arguments)
    .filter((args) => args[1] === "Temporary Render ingress probe");
  const url = "/api/v1/status";
  for (const sample of [
    { url, headers: https },
    { url, headers: { ...https, "x-ayinou-ingress-probe": "d".repeat(64) } },
    { url: "/health", headers: { ...https, "x-ayinou-ingress-probe": key } },
    { url, headers: { ...https, host: "example.invalid", "x-ayinou-ingress-probe": key } },
  ]) await app.inject(sample);
  assert.equal(probes().length, 0);
  for (let index = 0; index < 9; index++) {
    const result = await app.inject({
      url,
      remoteAddress: "198.51.100.77",
      headers: {
        ...https, "x-ayinou-ingress-probe": key, "x-forwarded-proto": "https, unlogged-scheme",
        "x-forwarded-for": "192.0.2.55, 192.0.2.56", cookie: "session=unlogged-cookie",
        authorization: "Bearer ey.unlogged.token",
      },
    });
    assert.equal(result.statusCode, 403);
    assert.equal(result.headers["strict-transport-security"], undefined);
    assert.equal(result.json().error.message, "HTTPS required");
    assert.ok(!result.body.includes("198.51.100.77"));
  }
  assert.equal(probes().length, 8);
  const [fields, event] = probes()[0];
  assert.equal(event, "Temporary Render ingress probe");
  assert.deepEqual({ ...(fields as object), reqId: "fixture-request" }, {
    reqId: "fixture-request",
    peerAddress: "198.51.100.77",
    peerFamily: 4,
    peerTrusted: false,
    protocol: "http",
    forwardedProtocolFirst: "https",
    forwardedProtocolLast: "other",
    forwardedProtocolLastCaseChanged: false,
    forwardedProtocolEntries: 2,
    forwardedForEntries: 2,
  });
  const log = JSON.stringify(probes());
  for (const sample of [key, "unlogged", "192.0.2.55", "192.0.2.56"]) assert.ok(!log.includes(sample));
  assert.deepEqual(counts(), { verified: 0, checked: 0 });
});
