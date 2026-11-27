import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("account standing exposes only the caller's restriction kind", async (t) => {
  const requests: string[] = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: {
      async verify() { return null; },
      async ownAccountRestriction(token) {
        requests.push(token);
        return token === "self" ? "suspended" : null;
      },
    },
  });
  t.after(() => app.close());
  const url = "/api/v1/me/account-standing";
  const guest = await app.inject({ url });
  assert.equal(guest.statusCode, 401);
  assert.deepEqual(requests, []);
  const own = await app.inject({ url: url + "?subject=someone-else", headers: { authorization: "Bearer self" } });
  assert.equal(own.statusCode, 200);
  assert.equal(own.headers["cache-control"], "private, no-store");
  assert.deepEqual(own.json(), { restriction: "suspended" });
  const expired = await app.inject({ url, headers: { authorization: "Bearer expired" } });
  assert.equal(expired.statusCode, 401);
  assert.deepEqual(requests, ["self", "expired"]);
});
