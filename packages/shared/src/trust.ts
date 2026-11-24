export const verificationKinds = ["identity", "notable_person", "organization", "government", "representative", "claim"] as const;
export const reviewDecisions = ["approve", "reject", "revoke"] as const;

export type VerificationKind = typeof verificationKinds[number];
export type ReviewDecision = typeof reviewDecisions[number];
export type VerificationStatus = "pending" | "approved" | "rejected" | "revoked" | "closed";
export const personalClaims = ["identity", "notable_person"] as const;
export type PersonalClaim = (typeof personalClaims)[number];
export const impersonationKinds = ["profile", "public_figure", "badge", "affiliation"] as const;
export const institutionImpersonationKinds = ["institution", "representative", "affiliation"] as const;
export const impersonationRestrictions = [...personalClaims, "restrict_institution"] as const;
export type ImpersonationKind = (typeof impersonationKinds | typeof institutionImpersonationKinds)[number];
export type ImpersonationRestriction = (typeof impersonationRestrictions)[number];
export const verificationAppealOutcomes = ["upheld", "reconsideration"] as const;
export type VerificationAppealOutcome = (typeof verificationAppealOutcomes)[number];
export type VerificationAppeal = {
  id: string; applicationId: string; outcome: "pending" | VerificationAppealOutcome;
  createdAt: string; decidedAt: string | null; rationale: string | null;
  assigned?: boolean; explanation?: string; references?: string[]; originalRationale?: string;
};
export type VerificationAssignment = {
  id: string; kind: VerificationKind; status: VerificationStatus; applicantUsername: string | null;
  organizationName: string | null; createdAt: string; eligibleReviewers: number;
  assigned: Array<{ handle: string | null; eligible: boolean }>;
};
export type ImpersonationReview = {
  id: string; kind: ImpersonationKind; subjectHandle: string | null; organizationHandle: string | null;
  explanation: string; references: string[]; createdAt: string;
};

export type VerificationApplication = {
  id: string; kind: VerificationKind; status: VerificationStatus; createdAt: string; organizationName: string | null;
  closureReason?: "superseded_by_founder_verification" | null;
  decidedAt: string | null; rationale: string | null; canAppeal?: boolean; eligibleApprovals?: number | null;
};
export type PersonalVerificationRequestState = "available" | "pending" | "already_verified";
export type VerificationWorkspace = {
  applications: VerificationApplication[];
  personalRequests: Record<PersonalClaim, PersonalVerificationRequestState>;
  independentIdentityReview?: boolean;
  institutionRequests?: Record<string, {
    institution: PersonalVerificationRequestState;
    representative: PersonalVerificationRequestState;
  }>;
};

export type ReviewApplication = Omit<VerificationApplication, "decidedAt" | "rationale"> & {
  decidedAt?: string | null;
  founderVerified?: boolean;
  assignedToMe: boolean;
  assignmentRequired?: boolean;
  eligibleReviewers?: number | null;
  organizationHandle: string | null; applicantName: string | null; applicantUsername: string | null; applicantId: string;
  evidence: string[];
  reviews: { decision: ReviewDecision; rationale: string; createdAt: string; isSelf: boolean }[];
};

export const reviewQueueModes = ["pending", "assigned", "approved", "rejected", "revoked", "closed"] as const;
export type ReviewQueueMode = (typeof reviewQueueModes)[number];
