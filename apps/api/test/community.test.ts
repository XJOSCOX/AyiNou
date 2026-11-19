import assert from "node:assert/strict";
import test from "node:test";
import type { CommunityStats } from "@ayinou/shared";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

const config = readConfig({ LOG_LEVEL: "silent" });
const empty: CommunityStats = {
  updatedAt: "2026-11-19T00:00:00Z", minimumCohort: 10,
  registered: 0, active: 0, verified: 0, geographyAvailable: true,
  haiti: 0, diaspora: 0, unknown: 0, representedDepartments: 0,
  departments: [{ code: "HT-OU", name: "Ouest", members: 0 }], diasporaCountries: [],
};

test("public community routes return aggregate contracts without member rows", async () => {
  const app = createApp(config, { community: { async stats() { return empty; } } });
  try {
    const [stats, departments, diaspora] = await Promise.all([
      app.inject("/api/v1/community/stats"),
      app.inject("/api/v1/community/departments"),
      app.inject("/api/v1/community/diaspora"),
    ]);
    assert.equal(stats.statusCode, 200);
    assert.deepEqual(stats.json(), { stats: empty });
    assert.equal(stats.headers["cache-control"], "public, max-age=30");
    assert.deepEqual(departments.json(), { updatedAt: empty.updatedAt, geographyAvailable: true, departments: empty.departments });
    assert.deepEqual(diaspora.json(), { updatedAt: empty.updatedAt, geographyAvailable: true, countries: [] });
    assert.equal(JSON.stringify(stats.json()).includes("residence_country_code"), false);
  } finally { await app.close(); }
});

test("suppressed geography stays hidden in every public route", async () => {
  const hidden: CommunityStats = { ...empty, registered: null, geographyAvailable: false,
    haiti: null, diaspora: null, unknown: null, representedDepartments: null,
    departments: null, diasporaCountries: null };
  const app = createApp(config, { community: { async stats() { return hidden; } } });
  try {
    const response = await app.inject("/api/v1/community/stats");
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().stats.geographyAvailable, false);
    assert.equal(response.json().stats.departments, null);
    assert.equal((await app.inject("/api/v1/community/departments")).json().departments, null);
    assert.equal((await app.inject("/api/v1/community/diaspora")).json().countries, null);
  } finally { await app.close(); }
});

test("unavailable statistics fail closed and requests are limited", async () => {
  const unavailable = createApp(config, { community: { async stats() { throw Error("database failure"); } } });
  try {
    const response = await unavailable.inject("/api/v1/community/stats");
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.includes("database failure"), false);
  } finally { await unavailable.close(); }

  const app = createApp(config, { community: { async stats() { return empty; } } });
  try {
    for (let index = 0; index < 60; index++) assert.equal((await app.inject("/api/v1/community/stats")).statusCode, 200);
    assert.equal((await app.inject("/api/v1/community/stats")).statusCode, 429);
  } finally { await app.close(); }
});
