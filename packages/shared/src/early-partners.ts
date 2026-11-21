export const earlyPartnerFeatures = [
  "pilot_feedback", "guided_onboarding", "feature_preview", "volunteer_testing", "program_preview", "pilot_documents", "beta_interface",
] as const;
export const earlyPartnerFeedbackCategories = ["usability", "accessibility", "defect", "suggestion"] as const;
export type EarlyPartnerFeature = typeof earlyPartnerFeatures[number];
export type EarlyPartnerCategory = typeof earlyPartnerFeedbackCategories[number];
export type EarlyPartnerState = "nominated" | "offered" | "active" | "suspended" | "declined" | "withdrawn" | "ended" | "expired";

export interface EarlyPartnerProgram {
  id: string;
  title: string;
  purpose: string;
  version: number;
  termsVersion: number;
  termsDigest: string;
  startsAt: string;
  endsAt: string;
  syntheticOpen: boolean;
  features: EarlyPartnerFeature[];
  capacity?: number;
  reserved?: number;
  nominate?: boolean;
  review?: boolean;
  eligibleKinds?: string[];
}

export interface EarlyPartnerEnrollment {
  id: string;
  organizationId: string;
  programId: string;
  state: EarlyPartnerState;
  revision: number;
  eligible: boolean;
  offerUntil: string | null;
  optedIn: boolean;
  canOffer: boolean;
  canFeedback: boolean;
  canRevokeFeedback: boolean;
  canRecordExpiry: boolean;
  canRecordEnd: boolean;
  canAccept: boolean;
  sameOwner: boolean;
}

export interface EarlyPartnerFeedback {
  id: string;
  enrollment_id: string;
  feature: EarlyPartnerFeature;
  category: EarlyPartnerCategory;
  description: string;
  steps: string | null;
  state: "open" | "resolved";
  resolution: string | null;
  revision: number;
}

export interface EarlyPartnerWorkspace {
  operational: false;
  role: "owner" | "administrator" | null;
  programs: EarlyPartnerProgram[];
  enrollments: EarlyPartnerEnrollment[];
  feedback: EarlyPartnerFeedback[];
  events: { id: string; enrollmentId: string | null; action: string; revision: number; at: string }[];
}
