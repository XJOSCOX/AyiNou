export const organizationKinds = ["haitian_organization", "international_organization", "ngo", "nonprofit", "foundation",
  "business", "education", "media", "municipality", "ministry", "embassy", "government_agency"] as const;
export const governmentKinds: readonly OrganizationKind[] = ["municipality", "ministry", "embassy", "government_agency"];
export const invitedRoles = ["administrator", "editor", "viewer"] as const;

export type OrganizationKind = typeof organizationKinds[number];

export const organizationRegistrationStatuses = ["unknown", "informal_unregistered", "pursuing_registration", "registered"] as const;
export type OrganizationRegistrationStatus = typeof organizationRegistrationStatuses[number];

export interface OrganizationRegistration {
  status: OrganizationRegistrationStatus;
  version: number;
}

export type OrganizationRole = "owner" | typeof invitedRoles[number];

export type InstitutionInput = {
  name: string; handle: string; kind: OrganizationKind; description: string | null; countryCode: string;
  departmentCode: string | null; website: string | null; contactEmail: string | null;
};
export type Institution = Omit<InstitutionInput, "contactEmail"> & {
  id: string; logoUrl: string | null; departmentName: string | null;
  status: "active" | "archived" | "restricted"; verificationStatus: "unverified" | "verified" | "revoked";
};
export type VerifiedRepresentatives = {
  representatives: Array<{ username: string; displayName: string; founderVerified?: true }>;
  ownConsent: boolean | null;
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
  registration?: OrganizationRegistration & { locked: boolean };
  representatives: { id: string; role: OrganizationRole; expiresAt: string | null; displayName: string | null;
    username: string | null; verified: boolean; isSelf: boolean }[];
  invitations: { id: string; role: OrganizationRole; expiresAt: string; username: string | null }[];
  activity: { event: string; occurredAt: string }[];
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
