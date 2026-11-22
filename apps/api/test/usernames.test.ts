import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { MemberRepository } from "../src/services/members.js";
import { createReadBudget } from "../src/services/read-budget.js";

test("username availability normalizes ASCII, returns only status, and limits request volume", async () => {
  const checked: string[] = [];
  const members: MemberRepository = {
    async usernameAvailability(username) { checked.push(username); return "unavailable"; },
    async get() { throw new Error("Unexpected member lookup"); },
    async update() { throw new Error("Unexpected member write"); },
    async departments() { return []; },
    async close() {},
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { members, auth: { async verify() { return null; } } });
  const request = (value: string) => app.inject({
    method: "GET", url: "/api/v1/usernames/availability?username=" + encodeURIComponent(value),
  });
  try {
    const available = await request("  Marie_Pierre  ");
    assert.equal(available.statusCode, 200);
    assert.deepEqual(available.json(), { status: "unavailable" });
    assert.equal(available.headers["cache-control"], "no-store");
    assert.deepEqual((await request("mаrie")).json(), { status: "invalid" });
    assert.deepEqual((await request("1marie")).json(), { status: "invalid" });
    assert.deepEqual(checked, ["marie_pierre"]);
    for (let index = 0; index < 27; index++) assert.equal((await request("x")).statusCode, 200);
    const limited = await request("marie");
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers["retry-after"], "60");
    assert.equal(limited.json().error.code, "RATE_LIMITED");
  } finally { await app.close(); }
});

test("username availability and public discovery have independent read budgets", async () => {
  const budget = createReadBudget(readConfig({ LOG_LEVEL: "silent" }));
  const address = "192.0.2.10";
  for (let index = 0; index < 30; index++) await budget("username", null, address);
  await assert.rejects(budget("username", null, address), /RATE_LIMITED/);
  await budget("discovery", null, address);
});
