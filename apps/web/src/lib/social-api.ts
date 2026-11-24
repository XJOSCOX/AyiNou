import type { FeedPage, FollowTarget, Locale, OrganizationRole } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

export type SocialNoticePreferences = { mentions: boolean; reposts: boolean; quotes: boolean };
export const loadSocialPreferences = (signal: AbortSignal): Promise<SocialNoticePreferences> =>
  authorizedSocialRequest("/api/v1/me/social-notification-preferences", { signal });

export const saveSocialPreferences = (value: SocialNoticePreferences): Promise<SocialNoticePreferences> =>
  authorizedSocialRequest("/api/v1/me/social-notification-preferences", { method: "PUT", body: JSON.stringify(value) });

export function loadSocialFeed(scope: "saved" | "hashtag", tag: string | undefined, cursor: string | null, signal: AbortSignal): Promise<FeedPage> {
  const query = new URLSearchParams({ scope });
  if (tag) query.set("tag", tag);
  if (cursor) query.set("cursor", cursor);
  return authorizedSocialRequest("/api/v1/feed/social?" + query, { signal });
}

export const searchHashtags = (q: string, signal: AbortSignal): Promise<{ tags: string[] }> =>
  authorizedSocialRequest("/api/v1/discover/hashtags?" + new URLSearchParams({ q }), { signal });

export const setInteraction = (id: string, kind: "repost" | "bookmark", enabled: boolean): Promise<{ enabled: boolean }> =>
  authorizedSocialRequest("/api/v1/posts/" + id + "/social", { method: "PUT", body: JSON.stringify({ kind, enabled }) });

export function followReposts(target: FollowTarget, enabled?: boolean, signal?: AbortSignal): Promise<{ mutual: boolean; showReposts: boolean | null }> {
  return authorizedSocialRequest("/api/v1/me/follow-reposts/" + target.kind + "/" + encodeURIComponent(target.key),
    enabled === undefined ? { signal } : { method: "PUT", body: JSON.stringify({ enabled }) });
}

export function canPublishAsOrganization(role: OrganizationRole) {
  return role === "owner" || role === "administrator" || role === "editor";
}

export function publishedProjectId(value: string) {
  return value.trim().match(/(?:^|\/projects\/)([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i)?.[1];
}

export function publishSocialPost(input: ({ sourceId: string; organization?: undefined } | { organization: string; sourceId?: string; announcement?: boolean; projectId?: string }) & { body: string; language: Locale }, id: string): Promise<{ id: string }> {
  return authorizedSocialRequest("/api/v1/posts/social", {
    method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": id },
  });
}

export function loadOrganizationPosts(handle: string, filter: string, signedIn: boolean, cursor: string | null, signal: AbortSignal): Promise<FeedPage> {
  const query = new URLSearchParams({ filter, ...(cursor ? { cursor } : {}) });
  return (signedIn ? authorizedSocialRequest : publicRequest)(`/api/v1/institutions/by-handle/${encodeURIComponent(handle)}/posts?${query}`, { signal });
}

export const setOrganizationPin = (id: string, version: number, pinned: boolean): Promise<void> =>
  authorizedSocialRequest("/api/v1/posts/" + id + "/organization-pin", { method: "PUT", body: JSON.stringify({ version, pinned }) });
