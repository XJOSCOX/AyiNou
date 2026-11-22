import type { VerificationStatus } from "./trust.ts";

export const founderCaseStates = ["consent_pending", "proof_pending", "ready_for_review", "granted", "held", "revoked", "denied", "withdrawn"] as const;
export const founderDecisions = ["confirmed", "insufficient_proof", "conflict", "account_risk", "member_request", "corrected"] as const;
export const founderMemberActions = ["consent", "visibility", "withdraw", "correction", "supersede"] as const;
export const founderIdentityBases = ["in_person_identity_check", "live_video_identity_check"] as const;
export const founderReviewActions = ["grant", "hold", "release", "revoke", "deny", "conflict"] as const;

type Decision = typeof founderDecisions[number];
export type FounderMemberAction = typeof founderMemberActions[number];
export type FounderReviewAction = typeof founderReviewActions[number];

export interface FounderIdentityCase {
  id: string;
  version: number;
  policyVersion: number;
  state: typeof founderCaseStates[number];
  consented: boolean;
  disclose: boolean;
  correctionPending: boolean;
  controlReady?: boolean;
  liveEligible?: boolean;
  appealRef?: string | null;
  appealStatus?: "pending" | "upheld" | "revoked" | null;
  memberHistory?: { action: FounderCaseEvent; occurredAt: string }[];
  decision: Decision | null;
  updatedAt: string;
  regularApplication?: { id: string; revision: number; status: VerificationStatus } | null;
  supersessionConsented?: boolean;
  supersessionOutcome?: "no_consent" | "superseded_by_founder_verification" | "application_completed" | "stale_application" | "application_held" | null;
}

type FounderCaseEvent = FounderMemberAction | FounderReviewAction | "open" | "proof_recorded" | "account_control" | "attest"
  | "appeal_upheld" | "appeal_revoked";

export interface FounderAppealItem {
  id: string;
  username: string | null;
  status: FounderIdentityCase["state"];
  createdAt: string;
}

export interface FounderReviewCase extends FounderIdentityCase {
  username: string | null;
  conflicted: boolean;
  proofReady: boolean;
  history: {
    id: string;
    action: FounderCaseEvent;
    reason: Decision | null;
    occurredAt: string;
    version: number;
  }[];
}

export interface FounderIdentityQueue<T extends FounderIdentityCase = FounderIdentityCase> {
  issuanceEnabled: boolean;
  liveProofEnabled?: boolean;
  canIssue?: boolean;
  cases: T[];
}

export interface FounderIdentityReceipt {
  auditId: string;
  caseId: string;
  version: number;
}
