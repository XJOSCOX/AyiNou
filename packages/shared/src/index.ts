import type { Locale } from "./core.js";
export * from "./core";
export { departmentCommunityContent, type DepartmentCommunityContent } from "./department-community-content";

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
  personalClaims?: PersonalClaim[];
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
}
export interface FeedPost extends PostInput {
  attachments?: PostAttachment[];
  community?: { id: string; slug: string } | null;
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
  kind: "post_reaction" | "post_comment" | "comment_reply" | "new_follower" | "appeal_decided" |
    "verification_decided" | "verification_appeal_decided" | "representative_access_changed" |
    "ambassador_invited" | "ambassador_updated" | "organization_access_changed" |
    "project_submitted" | "project_assigned" | "project_changes" | "project_approved" | "project_rejected" | "project_operation" | "poll_event" | null;
  pollEvent?: { pollId: string; action: PollNotice } | null;
  projectOperation?: { projectId: string; action: ProjectOperationEvent | ProjectProgressEvent } | null;
  appealId?: string | null;
  postId: string | null;
  commentId: string | null;
  actor: Omit<FeedAuthor, "avatarUrl"> | null;
}
export type NotificationPage = { notifications: MemberNotification[]; nextCursor: string | null };
export const appealOutcomes = ["upheld", "overturned", "closed"] as const;
export type AppealOutcome = (typeof appealOutcomes)[number];
export type AppealKind = "post" | "comment";
export type MemberSafetyEntry = { id: string; username: string | null; name: string | null; createdAt: string };
export type MemberSafetyPage = { accounts: MemberSafetyEntry[]; nextCursor: string | null };
export interface ModerationAppeal {
  id: string;
  reason: string;
  outcome: "pending" | AppealOutcome;
  explanation: string | null;
  createdAt: string;
  decidedAt: string | null;
}
export type MemberAppealDecision = {
  id: string; kind: AppealKind; createdAt: string; deadline: string; eligible: boolean; appeal: ModerationAppeal | null;
};
export type AppealReview = ModerationAppeal & {
  kind: AppealKind; postId: string; commentId: string | null; body: string; language: Locale;
  originalReason: string; originalAt: string; conflict: boolean; canRestore: boolean;
  attachments?: PostAttachment[];
};
export type AppealPage<T> = { decisions: T[]; nextCursor: string | null };
export type SafetyOverview = {
  pendingPostReports: number; pendingCommentReports: number; pendingAppeals: number;
  restrictedAccounts: number; moderationActions30Days: number; cleanupBacklog: number;
};
export type CommentTarget = { id: string; body: string; language: Locale; createdAt: string };
export const communityStaffRoles = ["moderator", "administrator"] as const;
export type CommunityStaffRole = (typeof communityStaffRoles)[number];
export type DepartmentCommunity = {
  id: string; slug: string; kind: "department"; departmentCode: string; name: string; joined: boolean;
  directoryVisible: boolean; role: CommunityStaffRole | null; canModerate: boolean; canManageRoles: boolean;
  memberCount: number | null;
};
export type CommunityMembers = { accounts: DiscoveryCard[]; nextCursor: string | null };
export const groupKinds = ["diaspora", "interest"] as const;
export const groupPolicies = ["public", "approval", "private"] as const;
export type GroupKind = (typeof groupKinds)[number];
export type GroupPolicy = (typeof groupPolicies)[number];
export type GroupRole = "owner" | CommunityStaffRole | "member";
export type GroupSettings = {
  name: string; description: string; rules: string; policy: GroupPolicy;
  discussionPublic: boolean; countryCode: string | null; topic: InterestCode | null;
};
export type MemberGroup = Omit<DepartmentCommunity, "kind" | "departmentCode" | "role"> & GroupSettings & {
  kind: GroupKind; departmentCode: null; role: GroupRole | null; version: number;
  requestStatus: "pending" | "approved" | "rejected" | "cancelled" | null;
};
export type Community = DepartmentCommunity | MemberGroup;
export const communityKinds = ["department", ...groupKinds] as const;
export const communityRecommendationFeedbackActions = ["not_interested", "hide", "restore"] as const;
export type CommunityRecommendationFeedbackAction = (typeof communityRecommendationFeedbackActions)[number];
export type CommunityRecommendationReason = "interest" | "related_topic" | "public_activity" | "explore";
export type CommunityRecommendation = {
  community: Community; reason: CommunityRecommendationReason; recentPublicActivity: boolean;
};
export type CommunityRecommendationPage = {
  recommendations: CommunityRecommendation[]; nextCursor: string | null; algorithmVersion: string;
};
export type CommunityRecommendationSettings = { hidden: number; notInterested: number };
export type GroupInvitation = { id: string; purpose: "membership" | "ownership"; expiresAt: string };
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
  { kind: "member"; self: boolean; personalClaims?: PersonalClaim[] }
  | { kind: "institution"; targetId: string; verificationStatus: "verified" | "unverified"; category: OrganizationKind;
      countryCode: string; departmentCode: string | null; description: string | null }
);
export type DiscoveryPage = { accounts: DiscoveryCard[]; nextCursor: string | null };
export type FollowTarget = { kind: "member" | "institution"; key: string };
export type FollowStatus = { following: boolean; canFollow: boolean; verified: boolean; personalClaims?: PersonalClaim[];
  followerCount: number; followingCount: number | null };
export type FollowList = "followers" | "following";
export type OrganizationRole = "owner" | typeof invitedRoles[number];
export type VerificationKind = typeof verificationKinds[number];
export type ReviewDecision = typeof reviewDecisions[number];
export type VerificationStatus = "pending" | "approved" | "rejected" | "revoked";
export const personalClaims = ["identity", "notable_person"] as const;
export type PersonalClaim = (typeof personalClaims)[number];
export const impersonationKinds = ["profile", "public_figure", "badge", "affiliation"] as const;
export const institutionImpersonationKinds = ["institution", "representative", "affiliation"] as const;
export const impersonationRestrictions = [...personalClaims, "restrict_institution"] as const;
export type ImpersonationKind = (typeof impersonationKinds | typeof institutionImpersonationKinds)[number];
export type ImpersonationRestriction = (typeof impersonationRestrictions)[number];
export const verificationAppealOutcomes = ["upheld", "reconsideration"] as const;
export type VerificationAppealOutcome = (typeof verificationAppealOutcomes)[number];
export type VerificationAppeal = {
  id: string; applicationId: string; outcome: "pending" | VerificationAppealOutcome;
  createdAt: string; decidedAt: string | null; rationale: string | null;
  assigned?: boolean; explanation?: string; references?: string[]; originalRationale?: string;
};
export type VerificationAssignment = {
  id: string; kind: VerificationKind; status: VerificationStatus; applicantUsername: string | null;
  organizationName: string | null; createdAt: string; eligibleReviewers: number;
  assigned: Array<{ handle: string | null; eligible: boolean }>;
};
export type ImpersonationReview = {
  id: string; kind: ImpersonationKind; subjectHandle: string | null; organizationHandle: string | null;
  explanation: string; references: string[]; createdAt: string;
};
export type InstitutionInput = {
  name: string; handle: string; kind: OrganizationKind; description: string | null; countryCode: string;
  departmentCode: string | null; website: string | null; contactEmail: string | null;
};
export type Institution = Omit<InstitutionInput, "contactEmail"> & {
  id: string; logoUrl: string | null; departmentName: string | null;
  status: "active" | "archived" | "restricted"; verificationStatus: "unverified" | "verified" | "revoked";
};
export type VerifiedRepresentatives = {
  representatives: Array<{ username: string; displayName: string }>;
  ownConsent: boolean | null;
};
export const ambassadorCategories = ["community", "education", "culture", "technology", "service"] as const;
export const ambassadorAdminActions = ["invite", "revoke", "suspend", "resume", "complete", "uphold", "allow_new_invitation"] as const;
export type AmbassadorCategory = (typeof ambassadorCategories)[number];
export type AmbassadorAdminAction = (typeof ambassadorAdminActions)[number];
export type AmbassadorStatus = "proposed" | "invited" | "active" | "declined" | "suspended" | "revoked" |
  "expired" | "completed" | "withdrawn";
export type AmbassadorCase = {
  id: string; version: number; category: AmbassadorCategory; status: AmbassadorStatus;
  createdAt: string; updatedAt: string; expiresAt: string | null; acceptedAt: string | null;
  publicOptIn: boolean; statement: string | null; publicEligible: boolean;
  reconsideration: "pending" | "upheld" | "new_invitation" | null; canRequestReview: boolean;
};
export type AmbassadorAdminCase = AmbassadorCase & {
  username: string | null; displayName: string | null;
  history: Array<{ version: number; event: AmbassadorAdminAction | "propose" | "accept" | "decline" | "publish" |
    "withdraw" | "expire" | "request_review"; reason: string | null; actorId: string | null; createdAt: string }>;
};
export type AmbassadorAdminPage = {
  candidate: { username: string; displayName: string | null; eligible: boolean; publicEligible: boolean } | null;
  cases: AmbassadorAdminCase[]; nextCursor: string | null;
};
export type PublicAmbassador = {
  username: string; displayName: string; category: AmbassadorCategory; statement: string | null; avatarUrl: string | null;
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
  decidedAt: string | null; rationale: string | null; canAppeal?: boolean; eligibleApprovals?: number | null;
};
export type ReviewApplication = Omit<VerificationApplication, "decidedAt" | "rationale"> & {
  assignedToMe: boolean;
  assignmentRequired?: boolean;
  eligibleReviewers?: number | null;
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
  canManageMembers: boolean; canReviewRequests: boolean; canInvite: boolean; canInviteStaff: boolean;
  members: (Affiliation & AffiliationPersonPreview & { canManage: boolean })[];
  requests: (AffiliationPersonPreview & { id: string; affiliationType: AffiliationType; message: string | null; createdAt: string })[];
  invitations: (AffiliationInvitation & { username: string | null })[];
};
export const organizationPermissions = [
  "organization.view", "content.edit", "affiliations.manage", "affiliations.review", "affiliations.invite", "team.view", "roles.assign",
  "projects.propose", "projects.edit", "projects.submit", "projects.view_private", "projects.operate", "polls.manage",
] as const;
export const futureOrganizationPermissions = [
  "tasks.assign", "volunteers.coordinate", "recruitment.manage", "finance.reports", "announcements.publish",
] as const;
export const protectedOrganizationPermissions = ["ownership", "verification", "platform", "contacts", "membershipPolicy"] as const;
export type OrganizationPermission = (typeof organizationPermissions)[number];
export type OrganizationRoleInput = { name: string; description: string | null; permissions: OrganizationPermission[] };
export type OrganizationCustomRole = OrganizationRoleInput & {
  id: string; version: number; deactivatedAt: string | null; canDelegate: boolean; assignedToMe: boolean;
};
export type OperationalOrganization = Pick<Institution, "id" | "name" | "handle">;
export type OrganizationRoleWorkspace = {
  organization: OperationalOrganization & { description: string | null };
  foundation: OrganizationRole | null;
  permissions: OrganizationPermission[];
  canEditRoles: boolean; canAssign: boolean; canViewTeam: boolean;
  roles: OrganizationCustomRole[];
  team: Array<{ id: string; username: string | null; displayName: string | null; foundation: OrganizationRole | null;
    assignable: boolean; assignments: { id: string; roleId: string }[] }>;
  activity: Array<{ id: string; roleId: string | null; event: "role_created" | "role_edited" | "role_deactivated" | "assigned" |
    "revoked" | "relationship_ended" | "ownership_ended"; before: OrganizationRoleInput | null; after: OrganizationRoleInput | null;
    occurredAt: string; actor: string | null; subject: string | null }>;
};
export const projectOwners = ["individual", "organization", "community"] as const;
export const projectReviewActions = ["assign", "release", "request_changes", "approve", "reject"] as const;
export const projectReportCategories = ["misleading", "privacy", "unsafe", "fundraising"] as const;
export type ProjectOwnerKind = (typeof projectOwners)[number];
export type ProjectReviewAction = (typeof projectReviewActions)[number];
export type ProjectReportCategory = (typeof projectReportCategories)[number];
export type ProjectStatus = "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "rejected";
export type ProjectProposal = {
  title: string; description: string; problem: string; solution: string; objectives: string; beneficiaries: string; outcomes: string;
  category: InterestCode; country: string; department: string | null; startDate: string | null; endDate: string | null;
  references: string[]; publishRequested: boolean;
};
export type ProjectDraft = { kind: ProjectOwnerKind; owner: string | null; association: string | null; proposal: ProjectProposal };
export type ProjectCard = {
  id: string; status: ProjectStatus; title: string; category: InterestCode; department: string | null; country: string;
  publishedAt: string | null; hasImage: boolean; owner: { kind: ProjectOwnerKind; name: string | null; handle: string | null };
  association: { name: string; handle: string } | null;
};
export type ProjectIdentityState = "verified" | "required" | "pending" | "revoked";
export type ProjectDetail = ProjectCard & {
  proposal: ProjectProposal; version: number | null; restricted: boolean; canEdit: boolean; canSubmit: boolean;
  submissionIdentity: ProjectIdentityState | null;
  publicationEligibility: "published" | "private" | "pending_institution_verification" | "unavailable" | null;
  canDecide: boolean; canReport: boolean; canOpenWork?: boolean;
  history: { action: "submit" | "request_changes" | "approve" | "reject" | "restrict"; revision: number; reason: string | null; createdAt: string }[];
};
export type ProjectOptions = {
  submissionIdentity: ProjectIdentityState;
  organizations: OperationalOrganization[]; communities: (OperationalOrganization & { canOwn: boolean })[];
  canReview: boolean; canModerate: boolean; canAssignOthers: boolean;
};
export type ProjectReviewItem = Pick<ProjectCard, "id" | "title" | "category" | "status"> & {
  version: number; assigned: boolean; assignedToMe: boolean; canClaim: boolean;
};
export type ProjectReport = {
  id: string; projectId: string; title: string; version: number; restricted: boolean; category: ProjectReportCategory; explanation: string;
};
export const projectTeamRoles = ["manager", "supervisor", "contributor", "volunteer"] as const;
export const projectExecutionStatuses = ["approved", "active", "paused", "completed", "archived"] as const;
export const projectTaskPriorities = ["low", "normal", "high"] as const;
export type ProjectTeamRole = (typeof projectTeamRoles)[number];
export type ProjectExecutionStatus = (typeof projectExecutionStatuses)[number];
export type ProjectTaskPriority = (typeof projectTaskPriorities)[number];
export type ProjectOperationEvent = "execution_status" | "invite" | "invite_accept" | "invite_decline" | "invite_revoke" |
  "member_revoke" | "opportunity_publish" | "opportunity_close" | "volunteer_apply" | "volunteer_offer" | "volunteer_reject" |
  "volunteer_confirm" | "volunteer_withdraw" | "task_create" | "task_edit" | "task_assign" | "task_accept" | "task_decline" |
  "task_progress" | "task_block" | "task_submit" | "task_approve" | "task_return" | "task_cancel" | "task_unassigned";
export type ProjectWorkPerson = { id: string; name: string | null; handle: string | null };
export type ProjectWorkTask = {
  milestoneId?: string | null;
  canCoordinate?: boolean;
  id: string; title: string; description: string; priority: ProjectTaskPriority; sensitive: boolean; dueOn: string | null;
  status: "todo" | "in_progress" | "blocked" | "submitted" | "completed" | "cancelled";
  version: number; assigned: boolean; mine: boolean; accepted: boolean; assignee: ProjectWorkPerson | null;
};
export type ProjectWork = {
  projectId: string; title: string; status: ProjectExecutionStatus; version: number; role: ProjectTeamRole | "owner" | "delegate" | null;
  identity: ProjectIdentityState; canApply: boolean;
  team: { person: ProjectWorkPerson | null; role: ProjectTeamRole; eligible: boolean; mine: boolean }[];
  invites: { id: string; role: ProjectTeamRole; expiresAt: string; recipient: ProjectWorkPerson | null; mine: boolean }[];
  opportunities: { id: string; title: string; description: string; skills: string; commitment: string;
    remote: boolean; capacity: number; closesOn: string | null; open: boolean }[];
  applications: { id: string; opportunityId: string; status: "pending" | "offered" | "accepted" | "rejected" | "withdrawn";
    feedback: string | null; title: string; applicant: ProjectWorkPerson | null; mine: boolean }[];
  tasks: ProjectWorkTask[];
  activity: { id: string; action: ProjectOperationEvent | ProjectProgressEvent; date: string; taskId: string | null; detail: string | null }[];
};
export type ProjectWorkIndex = {
  work: { id: string; title: string; status: ProjectExecutionStatus }[];
  opportunities: { id: string; projectId: string; title: string; remote: boolean }[];
};
export const platformRoles = ["administrator", "moderator", "verification_reviewer"] as const;
export const pollKinds = ["community", "priority", "decision", "person"] as const;
export const pollScopes = ["individual", "community", "organization", "project"] as const;
export const pollDecisions = ["recommend", "defer", "decline"] as const;
export type PollScope = (typeof pollScopes)[number];
export type PollKind = (typeof pollKinds)[number];
export type PollStatus = "draft" | "scheduled" | "open" | "awaiting_close" | "closed" | "cancelled";
export type PollEvent = "created" | "edited" | "published" | "finalized" | "cancelled" | "decision_recorded" |
  "nomination_accepted" | "nomination_declined" | "nomination_withdrawn";
export type PollNotice = "nomination_requested" | "finalized" | "cancelled" | "decision_recorded";
export type PollCard = {
  id: string; title: string; kind: PollKind; scope: PollScope; language: Locale;
  scopeName: string | null; status: PollStatus; policy: "advisory" | "governance"; closesAt: string; createdAt: string;
};
export type PollConfiguration = {
  title: string; description: string; language: Locale; audience: "members" | "scope"; eligibility: "active" | "verified";
  resultPolicy: "after_vote" | "after_close"; opensAt: string; closesAt: string; quorum: number | null; threshold: number | null;
};
export type PollResults = {
  total: number; options: { id: string; votes: number; percentage: number }[]; outcome: "no_votes" | "no_quorum" | "tie" |
    "withdrawn_leads" | "below_threshold" | "winner" | null; winnerId: string | null; quorumMet: boolean | null; thresholdMet: boolean | null;
};
export type PollDetail = PollCard & PollConfiguration & {
  scopeId: string | null; taskId: string | null; proposalRevision: number | null; finalizedAt: string | null;
  electorateSize: number | null; canManage: boolean; canVote: boolean; canModerate: boolean; version: number | null;
  ownBallot: string | null; results: PollResults | null; cancellationReason: string | null;
  decision: { disposition: (typeof pollDecisions)[number]; recommendedOptionId: string | null; reason: string; at: string } | null;
  options: { id: string; position: number; label: string | null; handle: string | null; available: boolean;
    consent: "pending" | "accepted" | "declined" | "withdrawn" | null }[];
  events: { id: string; action: PollEvent; version: number; reason: string | null; at: string }[];
};
type PollScopeOption = { id: string; name: string };
export type PollConfigOptions = {
  identity: ProjectIdentityState; communities: (PollScopeOption & { memberAudience: boolean })[];
  organizations: PollScopeOption[]; projects: (PollScopeOption & { tasks: PollScopeOption[] })[];
};
export type PollNomination = {
  id: string; pollId: string; title: string | null; description: string | null; language: Locale;
  consent: "pending" | "accepted"; canRespond: boolean;
};
export const projectProgressKinds = ["update", "evidence", "report"] as const;
export const projectProgressEvents = [
  "milestone_create", "milestone_edit", "milestone_assigned", "milestone_start", "milestone_block", "milestone_submit",
  "milestone_submitted", "milestone_approve", "milestone_approved", "milestone_return", "milestone_returned", "milestone_cancel",
  "milestone_hide", "task_milestone", "metric_create", "metric_edit", "metric_observe", "entry_create", "entry_edit", "entry_image",
  "entry_submit", "entry_approve", "entry_return", "entry_reject", "entry_withdraw", "entry_remove_image", "team_update_shared",
  "report_submitted", "report_returned", "report_rejected", "report_published",
  "progress_project_completed",
] as const;
export type ProjectProgressEvent = (typeof projectProgressEvents)[number];
export type ProjectMilestone = {
  id: string; title: string; description: string; startsOn: string | null; targetOn: string | null;
  target: number | null; unit: string | null; displayOrder: number; publicRequested: boolean; updatedAt: string;
  status: "planned" | "in_progress" | "submitted" | "completed" | "blocked" | "cancelled";
  version: number | null; responsibleId: string | null; mine: boolean; canReview: boolean; canApprove: boolean;
};
export type ProjectMeasurement = {
  id: string; actual: number; startsOn: string; endsOn: string; explanation: string | null; reference: string | null;
  source: "self_reported";
};
export type ProjectMetric = {
  id: string; name: string; unit: string; target: number; version: number; observations: ProjectMeasurement[];
};
export type ProjectProgressContent = {
  title: string; description: string; summary: string; language: Locale; references: string[]; includeMetrics: boolean;
  unfinished?: string; challenges?: string; lessons?: string; nextSteps?: string; correction?: string;
};
export type ProjectProgressEntry = {
  id: string; kind: (typeof projectProgressKinds)[number]; visibility: "team" | "public";
  state: "draft" | "submitted" | "returned" | "approved" | "withdrawn" | "rejected";
  milestoneId: string | null; supersedesId: string | null; superseded: boolean; content: ProjectProgressContent;
  snapshot: { objectives: string | null; completedOn: string | null; milestones: { title: string; date: string }[] | null;
    metrics: (Pick<ProjectMeasurement, "actual" | "startsOn" | "endsOn" | "source"> & { name: string; unit: string; target: number })[] | null } | null;
  hasImage: boolean; reviewed: boolean; approvedAt: string | null; updatedAt: string; version: number | null; mine: boolean; canReview: boolean;
};
export type ProjectProgress = {
  status: Exclude<ProjectExecutionStatus, "approved">; completedOn: string | null; role: ProjectWork["role"]; canManage: boolean;
  milestones: ProjectMilestone[]; entries: ProjectProgressEntry[]; metrics: ProjectMetric[];
  history: { id: string; action: ProjectProgressEvent; subjectId: string; reason: string | null; at: string }[];
  taskCount: number | null; milestoneCount: number;
};
export type PlatformRole = (typeof platformRoles)[number];
export type AccountStatus = "active" | "suspended" | "banned";
export type PlatformAccess = { administrator: boolean; reviewer: boolean; totp: boolean };
export type AdminOverview = Record<"members" | "organizations" | "recentMembershipEvents" | "pendingVerifications" | "restrictedAccounts" | "recentAdminActions", number>;
export interface AdminAccount {
  bootstrapTrust?: boolean;
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
