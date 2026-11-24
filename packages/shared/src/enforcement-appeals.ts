export const enforcementAppealDomains = ["account", "legacy", "feature", "event"] as const;
export const enforcementAppealStatuses = ["submitted", "assigned", "correction", "upheld", "overturned",
  "protected_pending", "release_declined", "withdrawn", "closed"] as const;
export const enforcementAppealStaffActions = ["assign", "close", "return", "uphold", "overturn", "release", "decline_release"] as const;

export type EnforcementAppealDomain = typeof enforcementAppealDomains[number];
export type EnforcementAppealStatus = typeof enforcementAppealStatuses[number];
export type EnforcementAppealStaffAction = typeof enforcementAppealStaffActions[number];

export interface EnforcementAppeal {
  id: string;
  domain: EnforcementAppealDomain;
  decision: string;
  deadline: string;
  status: EnforcementAppealStatus;
  protected: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppealableDecision {
  domain: EnforcementAppealDomain;
  id: string;
  kind: string;
  category: string;
  issuedAt: string;
  deadline: string;
  expiresAt: string | null;
  scope: string;
  scopeId: string | null;
  protected: boolean;
  state: "active" | "revoked" | "expired";
}

export interface MemberEnforcementAppeals {
  decisions: (AppealableDecision & { canAppeal: boolean; appeal: EnforcementAppeal | null })[];
  appeals: (EnforcementAppeal & { kind: string })[];
  notices: { id: string; caseId: string | null; eventId: string | null; action: string; occurredAt: string }[];
}

export interface StaffEnforcementAppeal extends EnforcementAppeal {
  decisionInfo: AppealableDecision | null;
  reviewer: string | null;
  subject: string | null;
  canReview: boolean;
  canRelease: boolean;
  history: { id: string; action: string; occurredAt: string; narrative: string | null }[];
}

export interface StaffEnforcementAppeals {
  founder: boolean;
  reviewers: { id: string; username: string }[];
  cases: StaffEnforcementAppeal[];
  nextCursor: string | null;
}
