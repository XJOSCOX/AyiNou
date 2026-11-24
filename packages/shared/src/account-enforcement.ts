export const suspensionMinutes = [60, 1440, 4320, 10080, 43200, 129600] as const;
export const maxSuspensionMinutes = 129600;
export const accountEnforcementCategories = ["safety", "harassment", "spam", "integrity", "other"] as const;
export type AccountEnforcementCategory = (typeof accountEnforcementCategories)[number];

export interface AccountEnforcementNotice {
  reference: string;
  kind: "suspended" | "banned";
  category: AccountEnforcementCategory;
  startsAt: string;
  expiresAt: string | null;
  status: "active" | "expired" | "revoked";
  legacy?: boolean;
}

export interface MemberAccountEnforcement {
  notices: AccountEnforcementNotice[];
  canResume: boolean;
  appealAvailable: false;
}

type EnforcementRequest = { expected: string | null; requestId: string; reason: string; confirmed: true };
export type EnforcementAction = EnforcementRequest & (
  | { action: "suspend"; minutes: number; category: AccountEnforcementCategory }
  | { action: "extend"; minutes: number; reference: string }
  | { action: "ban"; category: AccountEnforcementCategory }
  | { action: "lift" | "lift_legacy"; reference: string }
);
