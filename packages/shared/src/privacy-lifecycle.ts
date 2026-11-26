export const lifecycleWarnings = [
  "last_administrator", "privileged_role", "institution_owner", "institution_authority", "group_owner", "group_staff",
  "third_party_discussion", "personal_project", "project_commitment", "protected_evidence", "shared_media",
  "voting_integrity", "c4_privacy_review", "inventory_limit", "evidence_hold",
] as const;
export type LifecycleWarning = typeof lifecycleWarnings[number];
export type LifecycleState = "preview" | "blocked" | "review_required" | "approved" | "partial" | "stale" | "simulated" | "quarantined";
export interface LifecycleSummary {
  state: LifecycleState;
  caseVersion: number;
  planVersion: number | null;
  receipt: string | null;
  warnings: LifecycleWarning[];
  confirmed: boolean;
  verifiedSteps: number;
}
