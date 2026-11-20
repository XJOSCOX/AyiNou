import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiRequestError, apiErrorCode, requestJson } from "../apps/web/src/lib/api-errors.ts";
import { errorMessages, localizedApiError } from "../apps/web/src/lib/error-i18n.ts";
import { reconcileReaction } from "../apps/web/src/lib/reaction-state.ts";
import { reconcileFollow } from "../apps/web/src/lib/follow-state.ts";
import { communityDiscoveryMessages } from "../apps/web/src/lib/community-discovery-i18n.ts";

test("follow writes reconcile a lost response without replay and report permission failures directly", async () => {
  const network = new ApiRequestError("NETWORK_ERROR", 0, true);
  const forbidden = new ApiRequestError("FORBIDDEN", 403);
  const initial = { following: false, followerCount: 1, followingCount: 0, verified: false, canFollow: true };
  const saved = { ...initial, following: true, followerCount: 2 };
  let visible = initial;
  let writes = 0;
  let reads = 0;
  const read = async () => { reads++; return saved; };
  const apply = (state) => { visible = state; };
  await reconcileFollow(true, async () => { writes++; throw network; }, read, apply);
  assert.equal(visible, saved);
  await assert.rejects(reconcileFollow(false, async () => { writes++; throw network; }, read, apply), (cause) => cause === network);
  assert.equal(visible, saved);
  await assert.rejects(reconcileFollow(false, async () => { writes++; throw forbidden; }, read, apply), (cause) => cause === forbidden);
  assert.equal(writes, 3);
  assert.equal(reads, 2);
});

test("network failures and canceled requests remain distinct", async (t) => {
  const abort = new DOMException("Read canceled", "AbortError");
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("network failure"); });
  await assert.rejects(requestJson("https://example.invalid/feed"),
    (cause) => cause instanceof ApiRequestError && cause.code === "NETWORK_ERROR" && cause.retryable);
  fetch.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(requestJson("https://example.invalid/feed"), (cause) => cause === abort);
});

test("a lost reaction response triggers one read, preserves authoritative counts, and never replays a write", async () => {
  const timeout = new ApiRequestError("TIMEOUT", 0, true);
  const confirmed = { mine: "support", counts: { like: 0, love: 0, support: 2, celebrate: 0 } };
  const previous = { mine: null, counts: { like: 0, love: 0, support: 1, celebrate: 0 } };
  let writes = 0;
  let reads = 0;
  let state = previous;
  const write = async () => { writes++; throw timeout; };
  const apply = (result) => { state = result; };
  await reconcileReaction("support", write, async () => { reads++; return { reactions: confirmed }; }, apply);
  assert.equal(state, confirmed);
  await assert.rejects(reconcileReaction("support", write, async () => { reads++; return { reactions: previous }; }, apply), (error) => error === timeout);
  assert.equal(state, previous);
  await assert.rejects(reconcileReaction("support", write, async () => { reads++; throw timeout; }, apply), (error) => error === timeout);
  assert.equal(state, previous);
  assert.equal(writes, 3);
  assert.equal(reads, 3);
  for (const locale of ["ht", "fr", "en", "es"]) assert.equal(localizedApiError(locale, timeout), errorMessages[locale].timeout);
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

test("community reads distinguish expired snapshots and sessions from retryable gateway failures", async (t) => {
  const url = "https://example.invalid/api/v1/communities/recommendations/list";
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { code: "COMMUNITY_RECOMMENDATIONS_EXPIRED", message: "Untrusted server detail", requestId: "invalid" },
  }, { status: 409 }));
  await assert.rejects(requestJson(url), (cause) => {
    assert.equal(cause.code, "COMMUNITY_RECOMMENDATIONS_EXPIRED");
    assert.equal(cause.retryable, false);
    assert.equal(cause.requestId, undefined);
    for (const locale of ["ht", "fr", "en", "es"])
      assert.equal(localizedApiError(locale, cause), communityDiscoveryMessages[locale].expired);
    return true;
  });
  fetch.mock.mockImplementation(async () => Response.json({ error: { code: "OTHER_ERROR" } }, { status: 401 }));
  await assert.rejects(requestJson(url), (cause) => cause.code === "UNAUTHORIZED" && !cause.retryable);
  for (const status of [429, 502, 503, 504]) {
    fetch.mock.mockImplementation(async () => new Response("Unavailable upstream", { status }));
    await assert.rejects(requestJson(url), (cause) => cause instanceof ApiRequestError && cause.retryable);
  }
});
