import type { InstitutionInput, OrganizationKind, OrganizationRegistrationStatus } from "./institutions";

export type OrganizationSetupDraft =
  | ({ mode: "new"; registrationStatus?: OrganizationRegistrationStatus } & Partial<Omit<InstitutionInput, "contactEmail">>)
  | { mode: "existing"; targetHandle: string };

export type OrganizationSetupResult =
  | { kind: "created"; organizationId: string; handle: string }
  | { kind: "claim"; organizationId: string; handle: string; applicationId: string; reviewStatus: "pending" | "approved" | "rejected" | "revoked" | "unavailable" };

export interface OrganizationSetupMatch {
  handle: string;
  name: string;
  kind: OrganizationKind;
  verificationStatus: "unverified" | "verified" | "revoked";
}

export interface OrganizationSetupView {
  intentId: string | null;
  version: number | null;
  draft: OrganizationSetupDraft | null;
  eligible: boolean;
  profileComplete: boolean;
  result: OrganizationSetupResult | null;
}

export interface OrganizationSetupReceipt {
  intentId: string;
  version: number;
  requestId: string;
  draft: OrganizationSetupDraft | null;
  result: OrganizationSetupResult | null;
}

export type SignupPath = "individual" | "organization";
export type OrganizationIntentStage = "selected" | "drafting" | "awaiting_identity" | "cancelled";

export type OrganizationOnboardingIntent = {
  id: string;
  pathway: SignupPath;
  stage: OrganizationIntentStage;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationIntentUpdate = {
  id: string | null;
  expectedVersion: number;
  stage: "drafting" | "awaiting_identity";
  requestId: string;
};

export type OrganizationIntentReceipt = {
  intent: OrganizationOnboardingIntent;
  requestId: string;
};
