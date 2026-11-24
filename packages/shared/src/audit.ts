import type { VerificationPolicyFlag } from "./verification-policy.js";
import type { MemberExperienceFlag } from "./accounts.js";

export const auditCategories = ["platform", "governance", "security", "identity", "organization", "verification", "moderation"] as const;
export const auditResourceTypes = ["account", "proposal", "session_policy", "private_workflow", "username", "organization_role",
  "verification_case", "post", "comment", "appeal", "event"] as const;
export const auditOutcomes = ["recorded", "approved", "rejected", "revoked", "expired", "cancelled"] as const;

export type AuditCategory = typeof auditCategories[number];
export type AuditResourceType = typeof auditResourceTypes[number];
export type AuditOutcome = typeof auditOutcomes[number];
export type AuditAuthority = "founder";

export type AuditPerson = { displayName: string | null; username: string | null };

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
  actor?: AuditPerson;
  resourceType: AuditResourceType;
  resourceRef: string | null;
  affectedMember?: AuditPerson;
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

type ModerationPolicyValue = import("./moderation-policy").ModerationPolicy;

export interface PolicyAuditEvent {
  source: "homepage" | "registration" | "member_experience" | "verification" | "moderation";
  revision: number;
  actorId: string | null;
  actorUsername: string | null;
  actor?: AuditPerson;
  occurredAt: string;
  reason: string;
  changes: {
    key: "homepageStatistics" | "enabled" | "mode" | "individualEnabled" | "organizationEnabled" | "referralsEnabled" | "rewardsEnabled" | MemberExperienceFlag | VerificationPolicyFlag | keyof ModerationPolicyValue;
    before: ModerationPolicyValue[keyof ModerationPolicyValue];
    after: ModerationPolicyValue[keyof ModerationPolicyValue];
  }[];
}

export interface PolicyAuditPage {
  events: PolicyAuditEvent[];
  nextCursor: string | null;
}
