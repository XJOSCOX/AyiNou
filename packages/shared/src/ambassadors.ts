import type { PersonalClaim } from "./trust.js";

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
export type AmbassadorMemberCase = AmbassadorCase & {
  invitedAt?: string | null; invitationMessage?: string | null;
  sender?: { displayName: string; personalClaims: PersonalClaim[]; founderVerified: boolean } | null;
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
