import type { CommentInput, CommentPage, FeedPage, FeedPost, FeedReportPage, FeedScope, ModerationAction, ModerationScope, PostInput, ReactionKind, ReactionSummary, ReportCategory } from "@ayinou/shared";
import { authorizedRequest } from "./api";
import { ApiRequestError } from "./api-errors";

function query<T extends string>(scope: T, cursor: string | null) {
  return new URLSearchParams({ scope, ...(cursor ? { cursor } : {}) });
}

export const loadFeed = (scope: FeedScope, cursor: string | null, signal: AbortSignal): Promise<FeedPage> =>
  (scope === "for_you" ? authorizedSocialRequest : authorizedRequest)(`/api/v1/feed?${query(scope, cursor)}`, { signal });

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

export const loadModeration = (scope: ModerationScope, target: "posts" | "comments", cursor: string | null, signal: AbortSignal): Promise<FeedReportPage> =>
  authorizedSocialRequest(`/api/v1/moderation/feed?${query(scope, cursor)}&target=${target}`, { signal });

export const moderateFeedContent = (target: "posts" | "comments", id: string, version: number, action: ModerationAction, reason: string): Promise<void> =>
  authorizedSocialRequest(`/api/v1/moderation/${target}/${id}`, { method: "PATCH", body: JSON.stringify({ version, action, reason }) });

export async function authorizedSocialRequest(path: string, init: RequestInit = {}) {
  const deadline = AbortSignal.timeout(12_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  try {
    return await authorizedRequest(path, { ...init, signal });
  } catch (cause) {
    if (deadline.aborted && !init.signal?.aborted) throw new ApiRequestError("TIMEOUT", 0, true);
    throw cause;
  }
}

export function loadComments(post: string, parent: string | null, cursor: string | null, signal: AbortSignal): Promise<CommentPage> {
  const params = new URLSearchParams();
  if (parent) params.set("parent", parent);
  if (cursor) params.set("cursor", cursor);
  return authorizedSocialRequest(`/api/v1/posts/${post}/comments?${params}`, { signal });
}

export const createComment = (post: string, parentId: string | null, input: CommentInput, key: string): Promise<{ id: string }> =>
  authorizedSocialRequest(`/api/v1/posts/${post}/comments`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ ...input, parentId }) });

export const editComment = (id: string, version: number, input: CommentInput): Promise<void> =>
  authorizedSocialRequest(`/api/v1/comments/${id}`, { method: "PATCH", body: JSON.stringify({ ...input, version }) });

export const deleteComment = (id: string, version: number): Promise<void> =>
  authorizedSocialRequest(`/api/v1/comments/${id}?version=${version}`, { method: "DELETE" });

export const reportComment = (id: string, category: ReportCategory, note: string): Promise<void> =>
  authorizedSocialRequest(`/api/v1/comments/${id}/reports`, { method: "POST", body: JSON.stringify({ category, note }) });

export const loadReaction = (target: "posts" | "comments", id: string): Promise<{ reactions: ReactionSummary }> =>
  authorizedSocialRequest(`/api/v1/${target}/${id}/reaction`);

export const setReaction = (target: "posts" | "comments", id: string, kind: ReactionKind | null): Promise<{ reactions: ReactionSummary }> =>
  authorizedSocialRequest(`/api/v1/${target}/${id}/reaction`, kind === null
    ? { method: "DELETE" }
    : { method: "PUT", body: JSON.stringify({ kind }) });
