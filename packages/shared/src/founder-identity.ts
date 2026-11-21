export const founderCaseStates = ["consent_pending", "proof_pending", "ready_for_review", "granted", "held", "revoked", "denied", "withdrawn"] as const;
export const founderDecisions = ["confirmed", "insufficient_proof", "conflict", "account_risk", "member_request", "corrected"] as const;
export const founderMemberActions = ["consent", "visibility", "withdraw", "correction"] as const;
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
  decision: Decision | null;
  updatedAt: string;
}

export interface FounderReviewCase extends FounderIdentityCase {
  username: string | null;
  conflicted: boolean;
  proofReady: boolean;
  history: {
    id: string;
    action: FounderMemberAction | FounderReviewAction | "open" | "proof_recorded";
    reason: Decision | null;
    occurredAt: string;
    version: number;
  }[];
}

export interface FounderIdentityQueue<T extends FounderIdentityCase = FounderIdentityCase> {
  issuanceEnabled: boolean;
  cases: T[];
}

export interface FounderIdentityReceipt {
  auditId: string;
  caseId: string;
  version: number;
}
