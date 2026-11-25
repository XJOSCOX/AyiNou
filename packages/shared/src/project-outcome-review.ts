import type { OutcomeResult } from "./project-outcomes";

export const outcomeReviewStatuses = ["queued", "clarification", "decided", "challenge", "reassessment", "withdrawn"] as const;
export const outcomeFindings = ["supported", "partially_supported", "insufficient_evidence", "not_supported"] as const;
export const outcomeReviewerPurposes = ["initial", "challenge", "assign"] as const;
export type OutcomeReviewStatus = (typeof outcomeReviewStatuses)[number];
export type OutcomeFindingClass = (typeof outcomeFindings)[number];
export type OutcomeReviewerPurpose = (typeof outcomeReviewerPurposes)[number];
export type OutcomeStaffLane = "admin" | "review";
export type OutcomeEvidenceItem = OutcomeResult["evidence"][number];

export interface OutcomeReviewSummary {
  id: string;
  department: string;
  status: OutcomeReviewStatus;
  revision: number;
  version: number;
}

export interface OutcomeFinding {
  id: string;
  revision: number;
  lane: "initial" | "challenge" | "reassessment";
  classification: OutcomeFindingClass;
  explanation: string;
  limitations: string;
  measurement: { quantity: number; unit: string; startsOn: string; endsOn: string; methodology: string } | null;
  availableAt: string;
  current: boolean;
  challengeUntil: string | null;
  challenge: { filedAt: string; resolution: "upheld" | "revised" | "returned" | "reassessed" | null;
    reason: string | null; decidedAt: string | null } | null;
}

export interface OutcomeReviewCase extends OutcomeReviewSummary {
  activeSource: boolean;
  availableForReview: boolean;
  released: boolean;
  releaseActive: boolean;
  assignment: { id: string; reviewer: string | null; lane: "initial" | "challenge" | "reassessment";
    deadline: string; acceptedAt: string | null; valid: boolean } | null;
}

export interface MemberOutcomeReview extends OutcomeReviewCase {
  findings: OutcomeFinding[];
  manifest: OutcomeEvidenceItem[];
  evidenceOptions: OutcomeEvidenceItem[] | null;
  clarification: string | null;
  history: { revision: number; explanation: string; manifest: OutcomeEvidenceItem[]; createdAt: string }[];
}

export interface ReleasedOutcomeEvidence {
  result: Omit<OutcomeResult, "evidence">;
  explanation: string;
  manifest: OutcomeEvidenceItem[];
  sourceId: string;
  sourceRevision: number;
  reviewRevision: number;
  challenge?: { explanation: string; classification: OutcomeFindingClass; findingExplanation: string; limitations: string } | null;
}

export interface OutcomeReviewEvent {
  action: string;
  actor: string | null;
  target: string | null;
  note: string | null;
  at: string;
  version: number | null;
  purpose?: OutcomeReviewerPurpose;
}

export interface OutcomeReviewerRoster {
  canAppoint: boolean;
  grants: { actor: string; label: string | null; purpose: OutcomeReviewerPurpose;
    state: "active" | "suspended" | "revoked"; version: number; expiresAt: string; eligible: boolean }[];
  history: OutcomeReviewEvent[];
  candidates: { actor: string; label: string }[];
}

export interface OutcomeReviewNotice {
  id: string;
  action: "assign" | "clarify" | "finding" | "uphold" | "revise" | "return";
  at: string;
  projectId: string | null;
  caseId: string | null;
}
