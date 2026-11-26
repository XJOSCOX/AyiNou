export const featureCapabilities = ["post", "comment", "reaction", "repost", "follow", "mention", "media",
  "organization_create", "organization_claim", "organization_publish", "organization_manage",
  "event_create", "event_manage", "event_announce", "event_rsvp",
  "community_create", "community_publish", "community_need_submit", "mentorship_participate", "group_manage", "project_create", "project_update",
  "volunteer_apply", "project_manage", "poll_create", "nomination", "poll_manage"] as const;
export const featureScopes = ["platform", "organization", "community", "event", "project", "poll"] as const;
export const featureCommands = ["restrict", "extend", "revoke", "delegate", "update_delegation", "revoke_delegation"] as const;
export type FeatureCapability = typeof featureCapabilities[number];
export type FeatureScope = typeof featureScopes[number];
export type FeatureCommand = typeof featureCommands[number];
export type FeatureAuthority = "founder" | "administrator" | "moderator";
export type FeatureStatus = "active" | "expired" | "revoked" | "inactive";
export interface FeatureEnforcementCase {
  id: string; subject: string | null; issuer: string | null; capability: FeatureCapability;
  scope: FeatureScope; scopeId: string | null; version: number;
  startsAt: string; expiresAt: string | null; status: FeatureStatus; authority?: FeatureAuthority;
  category?: import("./account-enforcement").AccountEnforcementCategory; maxMinutes?: number;
}
export type FeatureNotice = Omit<FeatureEnforcementCase, "issuer" | "subject" | "version" | "authority" | "maxMinutes">;
export interface FeatureEnforcementPage {
  authority: FeatureAuthority;
  capabilities: { key: FeatureCapability; highImpact: boolean; scopes: FeatureScope[] }[];
  subjects: { id: string; username: string; moderator: boolean }[];
  delegations: FeatureEnforcementCase[];
  restrictions: FeatureEnforcementCase[];
  history: { id: string; caseId: string; subject: string | null; capability: FeatureCapability; scope: FeatureScope;
    scopeId: string | null; action: string; actor: string | null; authority: string; occurredAt: string; policyVersion: number }[];
  nextCursor: string | null;
}
