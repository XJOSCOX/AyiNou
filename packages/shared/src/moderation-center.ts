export const moderationCenterViews = ["overview", "reports", "content", "restrictions", "history"] as const;
export const moderationDomains = ["feed", "communities", "events", "projects", "trust", "accounts", "features"] as const;
export const moderationStatuses = ["pending", "closed", "resolved", "dismissed", "restricted", "substantiated",
  "restored", "suspended", "banned", "provider_ban", "recorded", "hidden", "removed"] as const;
export const moderationHistoryActions = ["hide", "restore", "remove", "dismiss", "restricted", "restored", "dismissed",
  "account_suspended", "account_banned", "account_reinstated", "institution_restricted",
  "suspension_created", "suspension_extended", "restriction_expired", "restriction_revoked", "ban_issued", "ban_lifted",
  "feature_restrict", "feature_extend", "feature_revoke", "feature_expired", "feature_delegate",
  "feature_update_delegation", "feature_revoke_delegation", "feature_delegation_expired",
  "appeal_submit", "appeal_assign", "appeal_correct", "appeal_return", "appeal_uphold", "appeal_overturn",
  "appeal_release", "appeal_decline_release", "appeal_withdraw", "appeal_close", "appeal_conflict_denied"] as const;

export type ModerationCenterView = (typeof moderationCenterViews)[number];
export type ModerationDomain = (typeof moderationDomains)[number];

export interface ModerationSummary {
  id: string;
  source: string;
  domain: ModerationDomain;
  target: "post" | "comment" | "event" | "project" | "organization" | "account";
  targetId: string | null;
  scopeKey: string | null;
  status: string;
  action: string;
  occurredAt: string | null;
  expiresAt: string | null;
  actorRef: string | null;
  caseReference?: string | null;
  capability?: import("./feature-enforcement").FeatureCapability | null;
}

export interface ModerationCenterMetrics {
  pendingReports: number;
  hiddenContent: number;
  removedContent: number;
  restrictedAccounts: number;
  pendingAppeals: number;
  recentDecisions: number;
  eventReports: number;
  projectReports: number;
}

export interface ModerationCenterPage {
  rows: ModerationSummary[];
  nextCursor: string | null;
  metrics: ModerationCenterMetrics | null;
}
