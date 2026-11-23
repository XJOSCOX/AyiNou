export const verificationPolicyFlags = [
  "personalIntake", "organizationIntake", "publicFigureIntake", "founderBlue", "founderGold", "appealsIntake",
  "administratorAppointments", "organizationAssignments", "showBlue", "showGold",
  "recognitionEnabled", "recognitionAwards", "recognitionPublic",
] as const;
export type VerificationPolicyFlag = typeof verificationPolicyFlags[number];
export type VerificationPolicy = Record<VerificationPolicyFlag, boolean>;
export interface SavedVerificationPolicy {
  value: VerificationPolicy;
  revision: number;
  updatedAt: string;
}
export const recognitionIcons = ["ribbon", "sun", "leaf", "hands"] as const;
export type RecognitionIcon = typeof recognitionIcons[number];
export type RecognitionText = Record<"en" | "fr" | "ht" | "es", string>;
export interface RecognitionBadge {
  id: string;
  name: RecognitionText;
  description: RecognitionText;
  icon: RecognitionIcon;
  color: string | null;
  archived: boolean;
  awardsEnabled: boolean;
  publicEnabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface RecognitionAward {
  id: string;
  badgeId: string;
  username: string | null;
  awardedAt: string;
  revokedAt: string | null;
  public: boolean;
}
export interface RecognitionHistory { action: string; reason: string; at: string; actor: string | null; badgeId: string; awardId: string | null }
export interface RecognitionAdministration { badges: RecognitionBadge[]; awards: RecognitionAward[]; history: RecognitionHistory[] }
