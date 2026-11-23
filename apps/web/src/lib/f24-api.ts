import type { FollowRequestEntry, Locale, FeedPost, ProfileReply, SocialPrivacy } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

const privacyPath = "/api/v1/me/social-privacy";
export const loadSocialPrivacy = (signal: AbortSignal): Promise<SocialPrivacy> => authorizedSocialRequest(privacyPath, { signal });
export const saveSocialPrivacy = (settings: SocialPrivacy): Promise<SocialPrivacy> =>
  authorizedSocialRequest(privacyPath, { method: "PUT", body: JSON.stringify(settings) });

export type RequestView = "incoming" | "outgoing";
export type RequestAction = "approve" | "reject" | "cancel";
export function loadFollowRequests(view: RequestView, cursor: string | null, signal: AbortSignal): Promise<{ requests: FollowRequestEntry[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ view });
  if (cursor) query.set("cursor", cursor);
  return authorizedSocialRequest(`/api/v1/me/follow-requests?${query}`, { signal });
}
export const resolveFollowRequest = (id: string, action: RequestAction) =>
  authorizedSocialRequest(`/api/v1/me/follow-requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action }) });
export const removeFollower = (username: string) =>
  authorizedSocialRequest(`/api/v1/me/followers/${encodeURIComponent(username)}`, { method: "DELETE" });

export type ActivityTab = "posts" | "replies" | "media";
type ActivityPage = { posts?: FeedPost[]; replies?: ProfileReply[]; nextCursor: string | null };
export function loadMemberActivity(username: string, tab: ActivityTab, signedIn: boolean, keywords: string, cursor: string | null, signal: AbortSignal): Promise<ActivityPage> {
  const query = new URLSearchParams({ filter: tab });
  if (keywords && tab !== "replies") query.set("q", keywords);
  if (cursor) query.set("cursor", cursor);
  return (signedIn ? authorizedSocialRequest : publicRequest)(`/api/v1/members/${encodeURIComponent(username)}/timeline?${query}`, { signal });
}
export function searchPosts(filters: Record<string, string>, cursor: string | null, signal: AbortSignal): Promise<ActivityPage> {
  const query = new URLSearchParams(filters);
  if (cursor) query.set("cursor", cursor);
  return authorizedSocialRequest(`/api/v1/discover/posts?${query}`, { signal });
}
export const loadTrending = (signal: AbortSignal): Promise<{ tags: string[] }> =>
  authorizedSocialRequest("/api/v1/discover/trending", { signal });

export const localeNames: Record<Locale, string> = { en: "English", fr: "Français", ht: "Kreyòl ayisyen", es: "Español" };
