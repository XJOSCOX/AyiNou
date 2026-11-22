import type { OrganizationRegistrationStatus } from "./institutions";
import type { OrganizationSetupDraft } from "./organization-onboarding";

export type OnboardingCorrectionRequest =
  | { kind: "cancel" | "restart" | "claim_triage" }
  | { kind: "registration"; change: OrganizationRegistrationStatus }
  | { kind: "details"; change: Extract<OrganizationSetupDraft, { mode: "new" }> };

export interface OnboardingCorrection {
  id: string;
  intentId: string;
  intentVersion: number;
  kind: OnboardingCorrectionRequest["kind"];
  state: "requested" | "assigned" | "applied" | "protected" | "withdrawn" | "expired";
  version: number;
  blockers: string[];
  expiresAt: string;
  receiptId: string | null;
  assigned?: boolean;
  requested?: { change: OrganizationRegistrationStatus | OrganizationSetupDraft | null };
}

export interface CorrectionPreview extends OnboardingCorrection {
  currentIntentVersion: number;
  triage: string[];
  canApply: boolean;
  canAssign: boolean;
}

export interface CorrectionQueue {
  cases: OnboardingCorrection[];
  claimIntent: { id: string; version: number } | null;
  holdUntil: string | null;
}

export const governanceProposalKinds = ["appoint", "revoke", "suspend", "succession", "distributed", "recovery"] as const;
export type GovernanceProposalKind = typeof governanceProposalKinds[number];

export interface GovernanceProposal {
  id: string;
  kind: GovernanceProposalKind;
  version: number;
  governanceVersion: number;
  state: "pending" | "awaiting_acceptance" | "execution_closed" | "withdrawn" | "expired" | "activated" | "unavailable";
  authorizationMode?: "founder_direct";
  invitationIssued?: boolean;
  expiresAt: string;
  accepted: boolean;
  own?: boolean;
  targeted?: boolean;
  target?: string | null;
  rationale?: string | null;
}

export interface GovernanceStatus {
  mode: "bootstrap" | "distributed" | "recovery";
  version: number;
  executionEnabled: boolean;
  recoveryEnabled: boolean;
  proposals: GovernanceProposal[];
  administrators: { id: string; username: string | null; eligible: boolean; founding: boolean }[];
  authorities: string[];
  holds: { id: string; version: number; expiresAt: string; state: "active" | "released" | "expired"; canRelease: boolean }[];
  events: { id: string; scope: "proposal" | "authority"; action: string; version: number; occurredAt: string }[];
}
