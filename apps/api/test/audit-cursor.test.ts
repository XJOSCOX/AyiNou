import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuditCursor } from "../src/services/audit-cursor.js";
import { ApiError } from "../src/services/api-error.js";

test("audit cursors preserve database precision and bind to viewer, session, workspace and filters", () => {
  const cursor = createAuditCursor("one-disposable-test-key");
  const data = { high: "2026-01-01T01:00:00.123456+00:00", at: "2026-01-01T01:00:00.123455+00:00",
    source: "session_policy", id: "121", expires: Date.now() + 60_000 };
  const binding = ["subject", "session", "workspace", "category"];
  const encoded = cursor.seal(data, binding);
  assert.deepEqual(cursor.open(encoded, binding), data);
  assert.notEqual(cursor.seal(data, binding), encoded);
  const denied = (error: unknown) => error instanceof ApiError && error.statusCode === 400;
  for (let position = 0; position < binding.length; position++) {
    assert.throws(() => cursor.open(encoded, binding.map((value, index) => index === position ? "different" : value)), denied);
  }
  assert.throws(() => createAuditCursor("another-key").open(encoded, binding), denied);
  assert.throws(() => cursor.open(cursor.seal({ ...data, expires: 1 }, binding), binding), denied);
  assert.throws(() => cursor.open((encoded[0] === "K" ? "L" : "K") + encoded.slice(1), binding), denied);
});
