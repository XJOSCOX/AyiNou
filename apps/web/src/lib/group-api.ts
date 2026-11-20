import type { Community, CommunityRecommendationFeedbackAction, CommunityRecommendationPage, CommunityRecommendationSettings,
  CommunityStaffRole, GroupInvitation, GroupKind, GroupRole, GroupSettings, MemberGroup } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

const base = "/api/v1/communities";
const inbox = "/api/v1/me/community-invitations";
const room = (slug: string) => `${base}/${encodeURIComponent(slug)}`;
const page = (cursor: string | null) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
type GroupQuery = { kind?: GroupKind; mine?: boolean; search: string; country: string; topic: string };
export type GroupSection = "requests" | "staff" | "invitations";
export type ManagementEntry = { handle: string; name?: string; role?: GroupRole; id?: string; purpose?: GroupInvitation["purpose"]; expiresAt?: string };
export type ManagementAction =
  | { action: "invite" | "approve" | "reject" | "remove" | "transfer"; handle: string }
  | { action: "staff"; handle: string; role: CommunityStaffRole | null }
  | { action: "revoke"; invitationId: string };
export type GroupDraft = GroupSettings & { slug: string; kind: GroupKind };
export type GroupActivityView = "joined" | "managed" | "pending";
export type CommunityRecommendationFilters = { kind: Community["kind"] | ""; search: string; country: string; topic: string };

export function listCommunityRecommendations(filters: CommunityRecommendationFilters, cursor: string | null, signal: AbortSignal): Promise<CommunityRecommendationPage> {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (/^[A-Z]{2}$/.test(filters.country)) query.set("country", filters.country);
  if (filters.topic) query.set("topic", filters.topic);
  if (cursor) query.set("cursor", cursor);
  return authorizedSocialRequest(`${base}/recommendations/list?${query}`, { signal });
}

export const communityRecommendationSettings = (signal: AbortSignal): Promise<CommunityRecommendationSettings> =>
  authorizedSocialRequest("/api/v1/me/community-recommendation-settings", { signal });
export const saveCommunityRecommendationFeedback = (id: string, action: CommunityRecommendationFeedbackAction): Promise<void> =>
  authorizedSocialRequest(`${room(id)}/recommendation-feedback`, { method: "POST", body: JSON.stringify({ action }) });
export const resetCommunityRecommendationFeedback = (): Promise<void> =>
  authorizedSocialRequest("/api/v1/me/community-recommendation-feedback", { method: "DELETE" });

export function listGroupActivity(view: GroupActivityView, search: string, cursor: string | null, signal: AbortSignal): Promise<{ communities: MemberGroup[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ view, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) });
  return authorizedSocialRequest(`/api/v1/me/community-activity?${query}`, { signal });
}

export function listGroups(filters: GroupQuery, cursor: string | null, signal: AbortSignal, guest: boolean): Promise<{ communities: MemberGroup[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.mine) query.set("mine", "true");
  if (filters.search) query.set("search", filters.search);
  if (/^[A-Z]{2}$/.test(filters.country)) query.set("country", filters.country);
  if (filters.topic) query.set("topic", filters.topic);
  if (cursor) query.set("cursor", cursor);
  return (guest ? publicRequest : authorizedSocialRequest)(`${base}/groups?${query}`, { signal });
}

export const createGroup = (draft: GroupDraft, key: string): Promise<{ community: MemberGroup }> =>
  authorizedSocialRequest(base, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(draft) });
export const updateGroup = (slug: string, version: number, settings: GroupSettings): Promise<{ community: MemberGroup }> =>
  authorizedSocialRequest(`${room(slug)}/settings`, { method: "PATCH", body: JSON.stringify({ ...settings, version }) });
export const groupManagement = (slug: string, section: GroupSection, cursor: string | null, signal: AbortSignal): Promise<{ entries: ManagementEntry[]; nextCursor: string | null }> =>
  authorizedSocialRequest(`${room(slug)}/management/${section}${page(cursor)}`, { signal });
export const manageGroup = (slug: string, details: ManagementAction, reason: string): Promise<{ invitationId: string | null }> =>
  authorizedSocialRequest(`${room(slug)}/management`, { method: "POST", body: JSON.stringify({ ...details, reason }) });
export const groupInbox = (cursor: string | null, signal: AbortSignal): Promise<{ invitations: Array<GroupInvitation & { name: string }>; nextCursor: string | null }> =>
  authorizedSocialRequest(`${inbox}${page(cursor)}`, { signal });
export const respondGroupInvitation = (id: string, accept: boolean): Promise<void> =>
  authorizedSocialRequest(`${inbox}/${id}`, { method: "PATCH", body: JSON.stringify({ accept }) });
