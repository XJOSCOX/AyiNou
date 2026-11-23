import assert from "node:assert/strict";
import { test } from "node:test";
import { assertHostedOrigins, webListener } from "../web-environment.mjs";

test("web listener supports explicit values and keeps the localhost defaults", () => {
  assert.deepEqual(webListener({}), { host: "127.0.0.1", port: 4000 });
  assert.deepEqual(webListener({ WEB_HOST: "0.0.0.0", WEB_PORT: "4402" }), { host: "0.0.0.0", port: 4402 });
  assert.deepEqual(webListener({ WEB_HOST: "::1", WEB_PORT: "65535" }), { host: "::1", port: 65535 });
  for (const WEB_PORT of ["", "0", "-1", "3.5", "0x1000", "65536"]) {
    assert.throws(() => webListener({ WEB_PORT }), /WEB_PORT/);
  }
  assert.throws(() => webListener({ WEB_HOST: "https://localhost:4000" }), /WEB_HOST/);
});

const hosted = {
  WEB_ORIGIN: "https://web.example",
  NEXT_PUBLIC_API_URL: "https://api.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://database.example",
};
test("hosted builds require all three explicit HTTPS origins", () => {
  assert.doesNotThrow(() => assertHostedOrigins(hosted));
  assert.doesNotThrow(() => assertHostedOrigins({ ...hosted, WEB_ORIGIN: "https://web.example:443" }));
  assert.throws(() => assertHostedOrigins({}), /WEB_ORIGIN, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_URL/);
  for (const key of Object.keys(hosted)) {
    for (const bad of ["", "http://web.example", "https://localhost", "https://foo.localhost.",
      "https://127.2.3.4", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://0.0.0.0", "https://[::]",
      "https://web.example/", "https://web.example/page", "https://web.example?", "https://web.example/#hash", "https://name:pass@web.example"]) {
      assert.throws(() => assertHostedOrigins({ ...hosted, [key]: bad }), { message: new RegExp(key) });
    }
  }
});
