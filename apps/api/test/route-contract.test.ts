import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { InjectOptions } from "fastify";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { feedDatabaseError, type FeedRepository } from "../src/services/feed.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sibling = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const config = readConfig({ LOG_LEVEL: "silent" });
const inventoryFile = new URL("./fixtures/route-inventory.txt", import.meta.url);

test("Fastify method, path, body limit and route-local hooks match the audited inventory", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  const inventory: string[] = [];
  app.addHook("onRoute", (route) => {
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      const hooks = (["onRequest", "preParsing", "preValidation", "preHandler", "onSend", "onResponse"] as const)
        .filter((phase) => route[phase] !== undefined);
      inventory.push([method, route.url, route.bodyLimit ?? "-", hooks.join(",") || "-"].join(" "));
    }
  });
  await app.ready();
  const actual = inventory.sort().join("\n") + "\n";
  assert.equal(actual, readFileSync(inventoryFile, "utf8").replaceAll("\r\n", "\n"));
});

test("feed and project review preserve exact success and safe error envelopes", async (t) => {
  const calls: [string | null, string, Record<string, unknown>?][] = [];
  const verification: [string, boolean][] = [];
  const mediaBytes = Buffer.from("image fixture");
  const settings = { topics: ["education"], hiddenPosts: 0 };
  const preferences = { reactions: true, comments: true, replies: false, followers: false };
  const feed: FeedRepository = {
    async read(token, input) { calls.push([token, "read", input]); return []; },
    async recommendations(token, input) {
      calls.push([token, "recommendations", input]);
      return { rows: [], snapshotId: id, algorithmVersion: "v1" };
    },
    async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
      calls.push([token, name, input]);
      switch (name) {
        case "department_communities_for_client":
        case "list_feed_reports_for_client":
        case "list_comment_reports_for_client":
        case "department_reports_for_client":
        case "project_queue_for_client":
        case "notifications_for_client": return [] as T;
        case "can_review_department_for_client":
        case "can_review_post_for_client":
        case "can_download_post_media_for_client":
        case "feed_moderation_access": return true as T;
        case "notification_preferences_for_client":
        case "save_notification_preferences_for_client": return preferences as T;
        case "recommendation_settings_for_client":
          if (token === "unavailable") throw feedDatabaseError("XX000");
          return settings as T;
        case "save_recommendation_topics_for_client":
        case "clear_recommendation_feedback_for_client": return settings as T;
        case "notification_count_for_client": return 7 as T;
        case "project_review_for_client": return 2 as T;
        case "project_report_for_client": return id as T;
        case "mutate_post_for_client":
          if (input?.p_version === 2) throw feedDatabaseError("PFR09");
          return undefined as T;
        case "mark_notifications_for_client":
          if (input?.p_id === sibling) throw feedDatabaseError("PGRST301");
          return undefined as T;
        case "post_comment_target_for_client": return null as T;
        default: return undefined as T;
      }
    },
  };
  const app = createApp(config, {
    feed,
    auth: { async verify(token, requireMfa = false) {
      verification.push([token, requireMfa]);
      return token === "reviewer" || (!requireMfa && ["member", "unavailable"].includes(token)) ? id : null;
    } },
    media: { async cleanup() { return 0; }, async upload() {}, async download() { return mediaBytes; } },
  });
  t.after(() => app.close());

  async function check(input: InjectOptions & { url: string }, status: number, body: unknown, contract?: {
    calls?: typeof calls; verify?: typeof verification; headers?: Record<string, string>;
  }) {
    calls.length = 0;
    verification.length = 0;
    const result = await app.inject(input);
    assert.equal(result.statusCode, status, input.url);
    assert.equal(result.headers["cache-control"], "private, no-store", input.url);
    const requestId = result.headers["x-request-id"];
    assert.match(String(requestId), /^[a-f0-9-]{36}$/);
    const content = status === 204 ? result.body : result.headers["content-type"] === "image/webp" ? result.rawPayload : result.json();
    assert.deepEqual(content, status >= 400
      ? { error: { ...(body as object), requestId, retryable: status === 429 || status === 503 } } : body, input.url);
    for (const [name, value] of Object.entries(contract?.headers ?? {})) assert.equal(result.headers[name], value);
    if (contract?.calls) assert.deepEqual(calls, contract.calls, input.url);
    if (contract?.verify) assert.deepEqual(verification, contract.verify, input.url);
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const member = bearer("member");
  const reviewer = bearer("reviewer");
  const empty = { posts: [], nextCursor: null };
  await check({ url: "/api/v1/feed", headers: { "x-request-id": "untrusted" } }, 200, empty, { verify: [],
    calls: [[null, "read", { p_scope: "feed", p_limit: 20, p_before_at: null, p_before_id: null, p_id: null }]] });
  await check({ url: "/api/v1/feed?scope=following" }, 401, { code: "UNAUTHORIZED", message: "Authentication required" }, { calls: [], verify: [] });
  await check({ url: "/api/v1/feed", headers: bearer("inactive") }, 401, { code: "UNAUTHORIZED", message: "Authentication required" },
    { calls: [], verify: [["inactive", false]] });
  await check({ url: "/api/v1/feed?scope=for_you", headers: member }, 200, { ...empty, algorithmVersion: "v1" }, {
    calls: [["member", "recommendations", { p_snapshot: null, p_after: 0, p_limit: 20 }]],
  });
  await check({ url: "/api/v1/communities/ouest/public-posts", headers: bearer("ignored") }, 200, empty,
    { verify: [], calls: [[null, "read", { p_scope: "community", p_community: "ouest", p_limit: 20, p_before_at: null, p_before_id: null }]] });
  await check({ url: "/api/v1/communities/ouest/posts", headers: member }, 200, empty, { verify: [["member", false]] });
  await check({ url: "/api/v1/recommendations/settings", headers: member }, 200, settings);
  await check({ url: "/api/v1/recommendations/settings", headers: bearer("unavailable") }, 503,
    { code: "SERVICE_UNAVAILABLE", message: "The feed service is unavailable" });
  await check({ method: "PUT", url: "/api/v1/recommendations/settings", headers: member, payload: { topics: ["education", "education"] } },
    400, { code: "INVALID_INPUT", message: "Check the submitted fields" }, { calls: [] });
  await check({ url: "/api/v1/me/notification-preferences", headers: member }, 200, preferences);
  await check({ url: "/api/v1/me/notifications", headers: member }, 200, { notifications: [], nextCursor: null });
  await check({ url: "/api/v1/me/notifications/unread-count", headers: member }, 200, { count: 7 });
  await check({ method: "PATCH", url: `/api/v1/me/notifications/${sibling}`, headers: member, payload: { read: true } }, 401,
    { code: "UNAUTHORIZED", message: "Invalid or expired session" });
  await check({ url: `/api/v1/posts/${id}/comments/${sibling}` }, 404, { code: "NOT_FOUND", message: "Comment unavailable" });
  await check({ method: "DELETE", url: `/api/v1/posts/${id}?version=2`, headers: member }, 409,
    { code: "CONFLICT", message: "The content or request has changed" });
  await check({ url: "/api/v1/communities/ouest/moderation", headers: member }, 403,
    { code: "MFA_REQUIRED", message: "Recent authenticator verification is required" },
    { verify: [["member", false], ["member", true]], calls: [["member", "can_review_department_for_client", { p_key: "ouest" }]] });
  await check({ url: "/api/v1/moderation/feed?target=comments", headers: reviewer }, 200, { reports: [], nextCursor: null });
  await check({ url: `/api/v1/posts/${id}/attachments/${sibling}/image?review=true`, headers: reviewer }, 200, mediaBytes,
    { headers: { "x-content-type-options": "nosniff" }, verify: [["reviewer", false], ["reviewer", true]] });
  await check({ url: "/api/v1/projects/review", headers: reviewer }, 200, { items: [] },
    { calls: [["reviewer", "project_queue_for_client", { p_reports: false }]] });
  await check({ url: "/api/v1/projects/reports", headers: reviewer }, 200, { reports: [] },
    { calls: [["reviewer", "project_queue_for_client", { p_reports: true }]] });
  await check({ method: "POST", url: `/api/v1/projects/${id}/review`, headers: reviewer,
    payload: { version: 1, action: "approve", reason: "Review fixture only" } }, 200, { version: 2 },
    { calls: [["reviewer", "project_review_for_client", { p_id: id, p_version: 1, p_action: "approve",
      p_reason: "Review fixture only", p_reviewer: null }]] });
  await check({ method: "POST", url: `/api/v1/projects/${id}/reports`, headers: member,
    payload: { category: "privacy", explanation: "A local fixture report" } }, 201, { id });
  await check({ method: "PATCH", url: `/api/v1/projects/${id}/reports/${sibling}`, headers: reviewer,
    payload: { version: 1, restrict: true, reason: "A local fixture decision" } }, 204, "",
    { calls: [["reviewer", "project_report_decide_for_client", { p_id: id, p_report: sibling, p_version: 1,
      p_restrict: true, p_reason: "A local fixture decision" }]] });
});
