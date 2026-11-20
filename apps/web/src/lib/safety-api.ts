import type { AppealKind, AppealOutcome, AppealPage, AppealReview, MemberAppealDecision, MemberSafetyPage, SafetyOverview } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

function cursorQuery(cursor: string | null) {
  return cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
}
export type SafetyList = "blocked" | "muted";
export const loadSafetyAccounts = (list: SafetyList, cursor: string | null, signal: AbortSignal): Promise<MemberSafetyPage> =>
  authorizedSocialRequest(`/api/v1/me/${list}?limit=20${cursorQuery(cursor)}`, { signal });
export const clearSafetyAccount = (list: SafetyList, id: string): Promise<void> =>
  authorizedSocialRequest(`/api/v1/me/${list}/${id}`, { method: "DELETE" });
export const loadMute = (username: string, signal: AbortSignal): Promise<{ muted: boolean }> =>
  authorizedSocialRequest(`/api/v1/members/${encodeURIComponent(username)}/mute`, { signal });
export const setMemberSafety = (username: string, kind: "block" | "mute", enabled: boolean): Promise<void> =>
  authorizedSocialRequest(`/api/v1/members/${encodeURIComponent(username)}/${kind}`, { method: enabled ? "PUT" : "DELETE" });

export const loadMemberAppeals = (cursor: string | null, signal: AbortSignal): Promise<AppealPage<MemberAppealDecision>> =>
  authorizedSocialRequest(`/api/v1/me/moderation-appeals?limit=20${cursorQuery(cursor)}`, { signal });
export const submitAppeal = (id: string, kind: AppealKind, reason: string): Promise<{ id: string }> =>
  authorizedSocialRequest(`/api/v1/moderation/actions/${id}/appeals`, { method: "POST", body: JSON.stringify({ kind, reason }) });
export const loadReviewAppeals = (scope: "pending" | "history", cursor: string | null, signal: AbortSignal): Promise<AppealPage<AppealReview>> =>
  authorizedSocialRequest(`/api/v1/moderation/appeals?scope=${scope}${cursorQuery(cursor)}`, { signal });
export const decideAppeal = (id: string, outcome: AppealOutcome, explanation: string): Promise<void> =>
  authorizedSocialRequest(`/api/v1/moderation/appeals/${id}`, { method: "PATCH", body: JSON.stringify({ outcome, explanation }) });
export const loadSafetyOverview = (signal: AbortSignal): Promise<SafetyOverview> =>
  authorizedSocialRequest("/api/v1/admin/safety", { signal });
