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
  };
}

export const locales = ["ht", "fr", "en", "es"] as const;
export type Locale = (typeof locales)[number];
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
