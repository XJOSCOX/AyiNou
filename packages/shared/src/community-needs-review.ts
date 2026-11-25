import type { CommunityNeedContent } from "./community-needs";

export const needReviewActions = [
  "grant", "revoke", "assign_triage", "assign_review", "assign_challenge", "flag_conflict",
  "declare_conflict", "triage", "refer", "escalate", "flag_unsafe", "duplicate", "accept",
  "request_information", "correct", "observe", "supported", "insufficient_evidence",
  "not_supported", "close", "return", "challenge", "uphold_challenge", "return_challenge",
] as const;
export const needClarifications = ["clarify_scope", "clarify_beneficiaries", "clarify_references", "remove_personal_information"] as const;
export const needFindingSummaries = {
  supported: ["evidence_matches"],
  insufficient_evidence: ["missing_independent_sources", "scope_unconfirmed"],
  not_supported: ["conflicting_evidence"],
} as const;
export const needReviewLanes = ["admin", "triage", "review"] as const;
export type NeedReviewAction = typeof needReviewActions[number];
export type NeedReviewLane = typeof needReviewLanes[number];
export type NeedReviewState = "draft" | "submitted" | "under_review" | "needs_information" |
  "supported" | "insufficient_evidence" | "not_supported" | "withdrawn" | "closed";

export interface NeedReviewRow {
  id: string;
  communityId: string;
  revision: number;
  state: NeedReviewState;
}
export interface NeedReviewQueue {
  cases: NeedReviewRow[];
  nextCursor: string | null;
  canGrant: boolean;
  communities: { id: string; slug: string }[];
}
export interface NeedReviewCase extends NeedReviewRow {
  evidenceRevision: number;
  findingId: string | null;
  triager: string | null;
  reviewer: string | null;
  accepted: boolean | null;
  referred: boolean | null;
  escalated: boolean | null;
  unsafe: boolean | null;
  challengeUntil: string | null;
  challenge: { status: "pending" | "upheld" | "returned"; accepted: boolean; reviewer: string | null } | null;
  history: { action: string; state: NeedReviewState | null; revision: number | null; evidenceRevision: number | null;
    at: string; summary: string | null; note: string | null }[];
  versions?: { revision: number; content: CommunityNeedContent; at: string }[];
}
