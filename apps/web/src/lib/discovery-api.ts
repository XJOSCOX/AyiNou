import type { DiscoveryCard, DiscoveryFilter, DiscoveryPage, FollowList, FollowStatus, FollowTarget } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

function followPath(target: FollowTarget) {
  const namespace = target.kind === "member" ? "members" : "institutions";
  return `/api/v1/${namespace}/${encodeURIComponent(target.key)}`;
}

export const readFollow = (target: FollowTarget, signedIn: boolean, signal?: AbortSignal): Promise<FollowStatus> =>
  (signedIn ? authorizedSocialRequest : publicRequest)(`${followPath(target)}/follow`, { signal });

export const writeFollow = (target: FollowTarget, following: boolean): Promise<FollowStatus> =>
  authorizedSocialRequest(`${followPath(target)}/follow`, { method: following ? "PUT" : "DELETE" });

export function searchDiscovery(filter: DiscoveryFilter, cursor: string | null, signal: AbortSignal): Promise<DiscoveryPage> {
  const query = new URLSearchParams();
  if (filter.q) query.set("q", filter.q);
  if (filter.verified) query.set("verified", "true");
  if (filter.category) query.set("category", filter.category);
  if (filter.country) query.set("country", filter.country);
  if (filter.department) query.set("department", filter.department);
  if (cursor) query.set("cursor", cursor);
  return authorizedSocialRequest(`/api/v1/discover/${filter.kind}?${query}`, { signal });
}

export const loadSuggestions = (signal: AbortSignal): Promise<{ accounts: DiscoveryCard[] }> =>
  authorizedSocialRequest("/api/v1/discover/suggestions", { signal });

export function loadFollowList(target: FollowTarget | null, list: FollowList, cursor: string | null, signal: AbortSignal): Promise<DiscoveryPage> {
  const path = target ? `${followPath(target)}/${list}` : "/api/v1/me/following";
  return authorizedSocialRequest(cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path, { signal });
}
