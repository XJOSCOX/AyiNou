import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

const config = readConfig({ WEB_ORIGINS: "http://127.0.0.1:4000,http://localhost:4000", LOG_LEVEL: "silent" });

test("health and versioned status return structured responses", async () => {
  const app = createApp(config);
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok", service: "ayinou-api" });

    const status = await app.inject({ method: "GET", url: "/api/v1/status" });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json(), { status: "ok", service: "ayinou-api", version: "v1" });
  } finally {
    await app.close();
  }
});

test("CORS allows the configured web origin only", async () => {
  const app = createApp(config);
  try {
    const allowed = await app.inject({ method: "GET", url: "/api/v1/status", headers: { origin: "http://127.0.0.1:4000" } });
    assert.equal(allowed.headers["access-control-allow-origin"], "http://127.0.0.1:4000");
    const localhost = await app.inject({ method: "GET", url: "/api/v1/status", headers: { origin: "http://localhost:4000" } });
    assert.equal(localhost.headers["access-control-allow-origin"], "http://localhost:4000");
    const other = await app.inject({ method: "GET", url: "/api/v1/status", headers: { origin: "https://example.org" } });
    assert.notEqual(other.headers["access-control-allow-origin"], "https://example.org");
  } finally {
    await app.close();
  }
});

test("unknown routes return safe JSON errors", async () => {
  const app = createApp(config);
  try {
    const response = await app.inject({ method: "GET", url: "/missing", headers: { "x-request-id": "client-supplied" } });
    assert.equal(response.statusCode, 404);
    const requestId = response.headers["x-request-id"];
    assert.match(String(requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(response.json(), { error: { code: "NOT_FOUND", message: "Route not found", requestId, retryable: false } });
  } finally {
    await app.close();
  }
});

test("invalid environment is rejected", () => {
  assert.throws(() => readConfig({ API_PORT: "99999" }), /Invalid API environment/);
});
