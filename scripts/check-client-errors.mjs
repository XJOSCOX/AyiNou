import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiRequestError, apiErrorCode, requestJson } from "../apps/web/src/lib/api-errors.ts";
import { errorMessages, localizedApiError } from "../apps/web/src/lib/error-i18n.ts";

test("network failures and canceled requests remain distinct", async (t) => {
  const abort = new DOMException("Read canceled", "AbortError");
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("network failure"); });
  await assert.rejects(requestJson("https://example.invalid/feed"),
    (cause) => cause instanceof ApiRequestError && cause.code === "NETWORK_ERROR" && cause.retryable);
  fetch.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(requestJson("https://example.invalid/feed"), (cause) => cause === abort);
});

test("known codes and safe request references are preserved without exposing raw errors", async (t) => {
  const id = "11111111-1111-4111-8111-111111111111";
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { code: "CONFLICT", message: "Internal database details", requestId: id },
  }, { status: 409 }));
  await assert.rejects(requestJson("https://example.invalid/feed"), (cause) => {
    assert.equal(apiErrorCode(cause), "CONFLICT");
    assert.equal(cause.requestId, id);
    assert.equal(cause.retryable, false);
    for (const locale of ["ht", "fr", "en", "es"]) {
      assert.equal(localizedApiError(locale, cause), errorMessages[locale].conflict);
    }
    assert.equal(localizedApiError("en", new Error("Database password and stack details")), errorMessages.en.server);
    return true;
  });
});
