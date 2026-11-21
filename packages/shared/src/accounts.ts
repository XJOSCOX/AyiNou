import type { Locale } from "./core.js";

export type MembershipCategory = "haitian" | "international_supporter";
export const interestCodes = ["education", "peace", "healthcare", "agriculture", "technology", "entrepreneurship", "employment", "environment", "infrastructure", "culture"] as const;
export type InterestCode = typeof interestCodes[number];

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
  founderVerified?: true;
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

export const referralCodePattern = /^R1-[0-9A-F]{16}$/;

export type ReferralSummary = { confirmedCount: number };

export const platformRoles = ["administrator", "moderator", "verification_reviewer"] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type AccountStatus = "active" | "suspended" | "banned";
export type PlatformAccess = { administrator: boolean; reviewer: boolean; totp: boolean; founder?: boolean };
export type AdminOverview = Record<"members" | "organizations" | "recentMembershipEvents" | "pendingVerifications" | "restrictedAccounts" | "recentAdminActions", number>;
export interface AdminAccount {
  bootstrapTrust?: boolean;
  founder?: boolean;
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
