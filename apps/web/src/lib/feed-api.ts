import type { FeedPage, FeedPost, FeedReportPage, FeedScope, ModerationAction, ModerationScope, PostInput, ReportCategory } from "@ayinou/shared";
import { authorizedRequest } from "./api";

function query<T extends string>(scope: T, cursor: string | null) {
  return new URLSearchParams({ scope, ...(cursor ? { cursor } : {}) });
}

export const loadFeed = (scope: FeedScope, cursor: string | null, signal: AbortSignal): Promise<FeedPage> =>
  authorizedRequest(`/api/v1/feed?${query(scope, cursor)}`, { signal });

export const createPost = (input: PostInput, key: string): Promise<{ id: string }> =>
  authorizedRequest("/api/v1/posts", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(input) });

export const editPost = (post: FeedPost, input: PostInput): Promise<void> =>
  authorizedRequest(`/api/v1/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ ...input, version: post.version }) });

export const deletePost = (post: FeedPost): Promise<void> =>
  authorizedRequest(`/api/v1/posts/${post.id}?version=${post.version}`, { method: "DELETE" });

export const reportPost = (id: string, category: ReportCategory, note: string): Promise<void> =>
  authorizedRequest(`/api/v1/posts/${id}/reports`, { method: "POST", body: JSON.stringify({ category, note }) });

export const loadFeedModerationAccess = (signal: AbortSignal): Promise<{ allowed: boolean }> =>
  authorizedRequest("/api/v1/me/feed-moderation", { signal });

export const loadModeration = (scope: ModerationScope, cursor: string | null, signal: AbortSignal): Promise<FeedReportPage> =>
  authorizedRequest(`/api/v1/moderation/feed?${query(scope, cursor)}`, { signal });

export const moderatePost = (id: string, version: number, action: ModerationAction, reason: string): Promise<void> =>
  authorizedRequest(`/api/v1/moderation/posts/${id}`, { method: "PATCH", body: JSON.stringify({ version, action, reason }) });
