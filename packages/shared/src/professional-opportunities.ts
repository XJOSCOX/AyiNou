import type { OrganizationKind } from "./institutions";

export const professionalOpportunityTypes = ["employment", "internship", "scholarship", "training", "education", "apprenticeship", "workshop"] as const;
export const professionalOpportunityModes = ["remote", "on_site", "hybrid"] as const;
export const professionalOpportunityScopes = ["haiti", "international"] as const;
export const professionalOpportunityCategories = ["professional", "educational"] as const;
export const professionalApplicationMethods = ["undecided", "external", "expression_of_interest", "event_registration"] as const;
export const professionalOpportunityStatuses = ["draft", "submitted", "changes_requested", "rejected", "approved", "published", "closed", "withdrawn", "restricted", "expired", "archived"] as const;

type OpportunityLiteral<T extends readonly string[]> = T[number];
export type OpportunityStatus = OpportunityLiteral<typeof professionalOpportunityStatuses>;
export type OpportunitySettings = {
  types: OpportunityLiteral<typeof professionalOpportunityTypes>[]; organizationKinds: OrganizationKind[];
  modes: OpportunityLiteral<typeof professionalOpportunityModes>[]; scopes: OpportunityLiteral<typeof professionalOpportunityScopes>[]; draftLimit: number;
};
export type OpportunitySkill = { code: string; version: number; names: Record<string, string> };
export type OpportunityInput = {
  title: string; description: string; type: OpportunityLiteral<typeof professionalOpportunityTypes>;
  language: "ht" | "fr" | "en" | "es"; category: OpportunityLiteral<typeof professionalOpportunityCategories>; country: string;
  department: string | null; mode: OpportunityLiteral<typeof professionalOpportunityModes>; opensOn: string | null; closesOn: string | null;
  details?: Record<string, unknown>;
  skills: string[]; references: string[]; applicationMethod: OpportunityLiteral<typeof professionalApplicationMethods>;
};
export type OpportunityList = {
  enabled: boolean; organizationName: string; canCreate: boolean; canEdit: boolean; verified: boolean; publisherEligible: boolean;
  settings: OpportunitySettings; skills: OpportunitySkill[]; next: string | null;
  items: { id: string; version: number; status: OpportunityStatus; title: string; type: OpportunityInput["type"] }[];
};
export type OpportunityDetail = {
  id: string; status: OpportunityStatus; version: number; next: number | null; representative: string | null;
  history: { version: number; status: OpportunityStatus; representative: string | null; recorded_at: string;
    snapshot: Omit<OpportunityInput, "skills"> & { schemaVersion: number; skills: OpportunitySkill[] } }[];
};
export type OpportunityFounderView = {
  settings: OpportunitySettings; defaults: OpportunitySettings; version: number; live: false;
  history: { version: number; reason: string; registered_at: string }[];
};
