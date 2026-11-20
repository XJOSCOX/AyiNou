export type ServiceState = "ok";

export interface HealthResponse {
  status: ServiceState;
  service: "ayinou-api";
}

export interface StatusResponse extends HealthResponse {
  version: "v1";
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryable?: boolean;
  };
}

export const locales = ["ht", "fr", "en", "es"] as const;
export type Locale = (typeof locales)[number];

export const postVisibilities = ["public", "members_only", "private"] as const;
export const reportCategories = ["harassment", "hate", "spam", "privacy", "other"] as const;
export const moderationActions = ["hide", "restore", "remove", "dismiss"] as const;
export const postBodyLimit = 2_000;
export const commentBodyLimit = 1_000;
export const reactionKinds = ["like", "love", "support", "celebrate"] as const;
export type ReactionKind = (typeof reactionKinds)[number];
export type ReactionSummary = { counts: Record<ReactionKind, number>; mine: ReactionKind | null };
export type PostVisibility = (typeof postVisibilities)[number];
export type ReportCategory = (typeof reportCategories)[number];
export type ModerationAction = (typeof moderationActions)[number];
export type PostStatus = "draft" | "published" | "hidden" | "removed";
export type FeedScope = "feed" | "mine" | "following" | "for_you";
export type ModerationScope = "reports" | "hidden";
export const recommendationReasons = ["topic", "follow", "language", "recent"] as const;
export type RecommendationReason = (typeof recommendationReasons)[number];
export const recommendationActions = ["not_interested", "less_author", "hide_author"] as const;
export type RecommendationAction = (typeof recommendationActions)[number];
export type RecommendationSettings = { topics: InterestCode[]; feedbackCount: number };
export type AttachmentInput = { id: string; alt?: string | null };
export type PostAttachment = { id: string; alt: string | null; width: number; height: number };
export type PostInput = {
  body: string; language: Locale; visibility: PostVisibility; topics?: InterestCode[]; attachments?: AttachmentInput[];
};
export interface FeedAuthor {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
}
export interface FeedPost extends PostInput {
  attachments?: PostAttachment[];
  id: string;
  status: PostStatus;
  createdAt: string;
  publishedAt: string | null;
  editedAt: string | null;
  version: number;
  own: boolean;
  author: FeedAuthor | null;
  reactions?: ReactionSummary;
  recommendationReason?: RecommendationReason;
}
export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
  algorithmVersion?: string;
}
export interface FeedReport {
  attachments?: PostAttachment[];
  id: string;
  postId: string;
  commentId?: string;
  body: string;
  language: Locale;
  status: PostStatus;
  deleted: boolean;
  own: boolean;
  version: number;
  category: ReportCategory | null;
  note: string | null;
  createdAt: string;
  lastAction: { action: ModerationAction; reason: string; createdAt: string } | null;
}
export type CommentInput = Pick<PostInput, "body" | "language">;
export const notificationPreferenceKeys = ["reactions", "comments", "replies", "followers"] as const;
export type NotificationPreferences = Record<(typeof notificationPreferenceKeys)[number], boolean>;
export interface MemberNotification {
  id: string;
  createdAt: string;
  readAt: string | null;
  available: boolean;
  kind: "post_reaction" | "post_comment" | "comment_reply" | "new_follower" | null;
  postId: string | null;
  commentId: string | null;
  actor: Omit<FeedAuthor, "avatarUrl"> | null;
}
export type NotificationPage = { notifications: MemberNotification[]; nextCursor: string | null };
export type CommentTarget = { id: string; body: string; language: Locale; createdAt: string };
type CommentPosition = { id: string; parentId: string | null; createdAt: string; hasReplies: boolean };
export type FeedComment = CommentPosition & (
  { available: true; body: string; language: Locale; editedAt: string | null; version: number;
    own: boolean; author: Omit<FeedAuthor, "avatarUrl"> | null; reactions: ReactionSummary }
  | { available: false; body: null; language: null; editedAt: null; version: null;
    own: false; author: null; reactions: null }
);
export interface CommentPage {
  comments: FeedComment[];
  nextCursor: string | null;
}
export interface FeedReportPage {
  reports: FeedReport[];
  nextCursor: string | null;
}
export type MembershipCategory = "haitian" | "international_supporter";
export const interestCodes = ["education", "peace", "healthcare", "agriculture", "technology", "entrepreneurship", "employment", "environment", "infrastructure", "culture"] as const;
export type InterestCode = typeof interestCodes[number];

export interface Department {
  code: string;
  name: string;
}

export interface MemberProfile {
  userId: string;
  displayName: string | null;
  preferredLocale: Locale;
  isVisible: boolean;
  residenceCountryCode: string | null;
  residenceDepartmentCode: string | null;
  diasporaDepartmentCode: string | null;
  firstName?: string | null;
  lastName?: string | null;
  membershipCategory?: MembershipCategory | null;
  onboardingStep?: number;
  username?: string | null;
  biography?: string | null;
  avatarUrl?: string | null;
  discoverable?: boolean;
  showMembershipCategory?: boolean;
  interests?: InterestCode[];
}

export interface ProfilePreview {
  displayName: string | null;
  username: string | null;
  biography: string | null;
  avatarUrl: string | null;
  membershipCategory: MembershipCategory | null;
}

export type ProfileChanges = Partial<Omit<MemberProfile, "userId" | "isVisible" | "avatarUrl">>;

export interface UpdateMemberProfile {
  displayName: string;
  preferredLocale: Locale;
  residenceCountryCode: string | null;
  residenceDepartmentCode: string | null;
  diasporaDepartmentCode: string | null;
}

export interface CommunityDepartmentCount extends Department {
  members: number;
}

export interface CommunityCountryCount {
  code: string;
  members: number;
}

export interface CommunityStats {
  updatedAt: string;
  minimumCohort: 10;
  registered: number | null;
  active: number | null;
  verified: number | null;
  geographyAvailable: boolean;
  haiti: number | null;
  diaspora: number | null;
  unknown: number | null;
  representedDepartments: number | null;
  departments: CommunityDepartmentCount[] | null;
  diasporaCountries: CommunityCountryCount[] | null;
  membership?: { haitian: number; internationalSupporter: number; unspecified: number } | null;
}
export const referralCodePattern = /^R1-[0-9A-F]{16}$/;

export type ReferralSummary = { confirmedCount: number };

export const organizationKinds = ["haitian_organization", "international_organization", "ngo", "nonprofit", "foundation",
  "business", "education", "media", "municipality", "ministry", "embassy", "government_agency"] as const;
export const governmentKinds: readonly OrganizationKind[] = ["municipality", "ministry", "embassy", "government_agency"];
export const invitedRoles = ["administrator", "editor", "viewer"] as const;
export const verificationKinds = ["identity", "notable_person", "organization", "government", "representative", "claim"] as const;
export const reviewDecisions = ["approve", "reject", "revoke"] as const;

export type OrganizationKind = typeof organizationKinds[number];
export type DiscoveryKind = "people" | "institutions";
export type DiscoveryFilter = { kind: DiscoveryKind; q?: string; verified?: boolean; category?: OrganizationKind; country?: string; department?: string };
type DiscoveryCardBase = { id: string; handle: string; name: string; verified: boolean; following: boolean };
export type DiscoveryCard = DiscoveryCardBase & (
  { kind: "member"; self: boolean }
  | { kind: "institution"; targetId: string; verificationStatus: "verified" | "unverified"; category: OrganizationKind;
      countryCode: string; departmentCode: string | null; description: string | null }
);
export type DiscoveryPage = { accounts: DiscoveryCard[]; nextCursor: string | null };
export type FollowTarget = { kind: "member" | "institution"; key: string };
export type FollowStatus = { following: boolean; canFollow: boolean; verified: boolean; followerCount: number; followingCount: number | null };
export type FollowList = "followers" | "following";
export type OrganizationRole = "owner" | typeof invitedRoles[number];
export type VerificationKind = typeof verificationKinds[number];
export type ReviewDecision = typeof reviewDecisions[number];
export type VerificationStatus = "pending" | "approved" | "rejected" | "revoked";
export type InstitutionInput = {
  name: string; handle: string; kind: OrganizationKind; description: string | null; countryCode: string;
  departmentCode: string | null; website: string | null; contactEmail: string | null;
};
export type Institution = Omit<InstitutionInput, "contactEmail"> & {
  id: string; logoUrl: string | null; departmentName: string | null;
  status: "active" | "archived"; verificationStatus: "unverified" | "verified" | "revoked";
};
export type InstitutionAccounts = {
  organizations: (Institution & { role: OrganizationRole; expiresAt: string | null })[];
  invitations: { id: string; organizationName: string; role: OrganizationRole; expiresAt: string; termDays: number | null }[];
  canReview: boolean;
};
export type InstitutionManagement = {
  organization: Institution;
  role: OrganizationRole;
  contactEmail: string | null;
  identityLocked: boolean;
  representatives: { id: string; role: OrganizationRole; expiresAt: string | null; displayName: string | null;
    username: string | null; verified: boolean; isSelf: boolean }[];
  invitations: { id: string; role: OrganizationRole; expiresAt: string; username: string | null }[];
  activity: { event: string; occurredAt: string }[];
};
export type VerificationApplication = {
  id: string; kind: VerificationKind; status: VerificationStatus; createdAt: string; organizationName: string | null;
  decidedAt: string | null; rationale: string | null;
};
export type ReviewApplication = Omit<VerificationApplication, "decidedAt" | "rationale"> & {
  assignedToMe: boolean;
  organizationHandle: string | null; applicantName: string | null; applicantUsername: string | null; applicantId: string;
  evidence: string[];
  reviews: { decision: ReviewDecision; rationale: string; createdAt: string; isSelf: boolean }[];
};

export const affiliationTypes = ["member", "volunteer", "staff", "supporter"] as const;
export const membershipPolicies = ["open", "approval_required", "invitation_only"] as const;
export const affiliationActions = ["suspend", "reinstate", "remove", "change_type"] as const;
export type AffiliationType = typeof affiliationTypes[number];
export type MembershipPolicy = typeof membershipPolicies[number];
export type AffiliationAction = typeof affiliationActions[number];
export type AffiliationStatus = "pending" | "active" | "suspended" | "removed" | "left";
export type AffiliationAdmission = "self_joined" | "approved" | "invited";
export type AffiliationEvent = "requested" | "joined" | "approved" | "rejected" | "withdrawn" | "suspended" |
  "reinstated" | "removed" | "left" | "type_changed" | "directory_changed" | "policy_changed" | "invited" | "invitation_revoked";

export type Affiliation = {
  id: string; organizationId: string; affiliationType: AffiliationType; status: AffiliationStatus;
  admission: AffiliationAdmission | null; listed: boolean; joinedAt: string | null; updatedAt: string;
};

type AffiliationInvitation = { id: string; affiliationType: AffiliationType; expiresAt: string };
type AffiliationOrganization = { organizationName: string; handle: string };

export type MyAffiliations = {
  affiliations: (Affiliation & AffiliationOrganization)[];
  invitations: (AffiliationInvitation & AffiliationOrganization)[];
  history: { id: string; event: AffiliationEvent; affiliationType: AffiliationType | null;
    occurredAt: string; organizationName: string; reason: string | null }[];
};

export type AffiliationDirectory = {
  membershipPolicy: MembershipPolicy;
  directoryEnabled: boolean;
  members: { displayName: string; affiliationType: AffiliationType }[];
};

type AffiliationPersonPreview = { displayName: string | null; username: string | null; isSelf: boolean };
export type AffiliationManagement = {
  membershipPolicy: MembershipPolicy; directoryEnabled: boolean; policyLocked: boolean; canSetPolicy: boolean;
  members: (Affiliation & AffiliationPersonPreview)[];
  requests: (AffiliationPersonPreview & { id: string; affiliationType: AffiliationType; message: string | null; createdAt: string })[];
  invitations: (AffiliationInvitation & { username: string | null })[];
};
export const platformRoles = ["administrator", "moderator", "verification_reviewer"] as const;
export type PlatformRole = (typeof platformRoles)[number];
export type AccountStatus = "active" | "suspended" | "banned";
export type PlatformAccess = { administrator: boolean; reviewer: boolean; totp: boolean };
export type AdminOverview = Record<"members" | "organizations" | "recentMembershipEvents" | "pendingVerifications" | "restrictedAccounts" | "recentAdminActions", number>;
export interface AdminAccount {
  id: string;
  username: string | null;
  displayName: string | null;
  createdAt: string;
  confirmed: boolean;
  authBanned: boolean;
  verified: boolean;
  status: AccountStatus;
  reason: string | null;
  restrictionUpdatedAt: string | null;
  totp: boolean;
  roles: PlatformRole[];
}
export type AdminAccountAction =
  | { action: "status"; value: AccountStatus; reason: string }
  | { action: "grant" | "revoke"; value: PlatformRole; reason: string };
export interface AdminAuditEvent {
  id: string;
  actorId: string | null;
  subjectId: string | null;
  organizationId: string | null;
  event: string;
  role: PlatformRole | null;
  reason: string | null;
  occurredAt: string;
}
export const reviewQueueModes = ["pending", "assigned", "approved", "rejected", "revoked"] as const;
export type ReviewQueueMode = (typeof reviewQueueModes)[number];
