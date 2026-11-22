export const auditCategories = ["platform", "governance", "security", "identity", "organization", "verification", "moderation"] as const;
export const auditResourceTypes = ["account", "proposal", "session_policy", "private_workflow", "username", "organization_role",
  "verification_case", "post", "comment"] as const;
export const auditOutcomes = ["recorded", "approved", "rejected", "revoked", "expired", "cancelled"] as const;

export type AuditCategory = typeof auditCategories[number];
export type AuditResourceType = typeof auditResourceTypes[number];
export type AuditOutcome = typeof auditOutcomes[number];
export type AuditAuthority = "founder";

export interface AuditEvent {
  reference: string;
  source: string;
  sourceEventId: string;
  version: 1;
  sourceVersion: number | null;
  category: AuditCategory;
  eventType: string;
  occurredAt: string;
  actorRef: string | null;
  resourceType: AuditResourceType;
  resourceRef: string | null;
  organizationRef: string | null;
  outcome: AuditOutcome;
  reasonCode: string | null;
  previousState: Readonly<Record<string, string | null>> | null;
  newState: Readonly<Record<string, string | null>> | null;
  requestRef: string | null;
  authority: AuditAuthority | null;
  retention: "source_policy";
  availability: "summary_only";
}

export interface AuditPage {
  version: 1;
  events: AuditEvent[];
  nextCursor: string | null;
}
