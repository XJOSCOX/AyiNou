import type { InterestCode } from "./accounts.js";
import type { OrganizationKind } from "./institutions.js";
import type { PersonalClaim } from "./trust.js";

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

export interface Department {
  code: string;
  name: string;
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

export type DiscoveryKind = "people" | "institutions";
export type DiscoveryFilter = { kind: DiscoveryKind; q?: string; verified?: boolean; category?: OrganizationKind; country?: string; department?: string };
type DiscoveryCardBase = { id: string; handle: string; name: string; verified: boolean; following: boolean };
export type DiscoveryCard = DiscoveryCardBase & (
  { kind: "member"; self: boolean; personalClaims?: PersonalClaim[]; founderVerified?: true }
  | { kind: "institution"; targetId: string; verificationStatus: "verified" | "unverified"; category: OrganizationKind;
      countryCode: string; departmentCode: string | null; description: string | null }
);
export type DiscoveryPage = { accounts: DiscoveryCard[]; nextCursor: string | null };
export type FollowTarget = { kind: "member" | "institution"; key: string };
export type FollowStatus = { following: boolean; canFollow: boolean; verified: boolean; personalClaims?: PersonalClaim[];
  followerCount: number; followingCount: number | null };
export type FollowList = "followers" | "following";
