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
