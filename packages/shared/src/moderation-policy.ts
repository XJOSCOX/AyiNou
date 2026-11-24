import type { AccountEnforcementCategory } from "./account-enforcement";
import { featureCapabilities, type FeatureCapability } from "./feature-enforcement";

const protectedCapabilities: readonly FeatureCapability[] = ["organization_manage", "event_manage", "group_manage", "project_manage", "poll_manage"];
export const ordinaryModerationCapabilities = featureCapabilities.filter((capability) => !protectedCapabilities.includes(capability));

export interface ModerationPolicy {
  suspensionPresets: number[];
  administratorMaxMinutes: number;
  moderatorMaxMinutes: number;
  defaultMinutes: number;
  delegableCapabilities: FeatureCapability[];
  reasonCategories: AccountEnforcementCategory[];
  repeatViolationGuidance: string;
  notifyStaffGuidance: boolean;
}

export interface ModerationPolicyRevision {
  revision: number;
  occurredAt: string;
  actorName: string | null;
  reason: string;
  previous: ModerationPolicy;
  value: ModerationPolicy;
  restoredFrom: number | null;
}

export interface ModerationPolicyWorkspace {
  revision: number;
  updatedAt: string;
  value: ModerationPolicy;
  history: ModerationPolicyRevision[];
}
