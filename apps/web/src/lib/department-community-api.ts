import type { Community, CommunityMembers, CommunityStaffRole, DepartmentCommunity, FeedPage } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

function path(key: string) { return `/api/v1/communities/${encodeURIComponent(key)}`; }
function page(cursor: string | null) { return cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""; }

export const loadDepartmentCommunities = (signal: AbortSignal): Promise<{ communities: DepartmentCommunity[] }> =>
  authorizedSocialRequest("/api/v1/communities", { signal });
export const loadDepartmentCommunity = (key: string, signal: AbortSignal, guest = false): Promise<{ community: Community }> =>
  (guest ? publicRequest : authorizedSocialRequest)(path(key), { signal });
export const changeDepartmentMembership = (key: string, join: boolean): Promise<{ community: Community | null }> =>
  authorizedSocialRequest(`${path(key)}${join ? "/join" : "/membership"}`, { method: join ? "POST" : "DELETE" });
export const changeDepartmentPrivacy = (key: string, directoryVisible: boolean): Promise<{ community: Community }> =>
  authorizedSocialRequest(`${path(key)}/membership`, { method: "PATCH", body: JSON.stringify({ directoryVisible }) });
export const loadDepartmentFeed = (key: string, cursor: string | null, signal: AbortSignal, guest = false): Promise<FeedPage> =>
  (guest ? publicRequest : authorizedSocialRequest)(`${path(key)}/${guest ? "public-posts" : "posts"}${page(cursor)}`, { signal });
export const loadDepartmentMembers = (key: string, cursor: string | null, signal: AbortSignal): Promise<CommunityMembers> =>
  authorizedSocialRequest(`${path(key)}/members${page(cursor)}`, { signal });
export const changeDepartmentStaff = (key: string, username: string, role: CommunityStaffRole | null, reason: string): Promise<void> =>
  authorizedSocialRequest(`${path(key)}/staff`, { method: "PATCH", body: JSON.stringify({ username, role, reason }) });
