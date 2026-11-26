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
  enabled: boolean; intakePaused?: boolean; organizationName: string; canCreate: boolean; canEdit: boolean; verified: boolean; publisherEligible: boolean;
  settings: OpportunitySettings; skills: OpportunitySkill[]; next: string | null;
  items: { id: string; version: number; status: OpportunityStatus; title: string; type: OpportunityInput["type"] }[];
};
export type OpportunityDetail = {
  id: string; status: OpportunityStatus; version: number; next: number | null; representative: string | null;
  history: { version: number; status: OpportunityStatus; representative: string | null; recorded_at: string;
    snapshot: Omit<OpportunityInput, "skills"> & { schemaVersion: number; skills: OpportunitySkill[] } }[];
};
export const opportunityDiscoveryDimensions = ["keyword","type","category","country","department","mode","skill","language","deadline","employmentType","payment","funding"] as const;
export const opportunityDiscoveryCriteria = ["type","interest","skill","language","location","mode","experience","compensation"] as const;
export const opportunityPreferenceFields = ["types","interests","skills","experience","countries","departments","modes","languages","objectives","compensation"] as const;
export const opportunityDiscoveryReasons = ["typeFit","interestFit","skillFit","qualificationsRequested","languageFit","locationFit","remoteFit","modeFit","experienceRequested","experienceFits","amountUnavailable","amountZero","amountIncomparable","amountFits","amountBelow","amountOverlaps"] as const;
export type OpportunityDiscoveryView = "latest" | "forYou" | "saved";
export type OpportunityDiscoveryConfiguration = {
  types: OpportunityInput["type"][];
  scopes: typeof professionalOpportunityScopes[number][];
  dimensions: typeof opportunityDiscoveryDimensions[number][];
  criteria: typeof opportunityDiscoveryCriteria[number][];
  fields: typeof opportunityPreferenceFields[number][];
  pageLimit: number; recommendationLimit: number; savedLimit: number; dismissDays: number; readinessNotes: string;
};
export type OpportunityDiscoverySettings = {
  version: number; live: false; configuration: OpportunityDiscoveryConfiguration;
  stages: Record<"discovery"|"preferences"|"personalization"|"saved","disabled"> & {activation:"unimplemented"};
  history: {version:number;reason:string;recordedAt:string}[];
};
export type OpportunityDiscoveryItem = {
  id: string; revision: number; organizationId: string; organization: string; handle: string;
  status: "published"; verified: boolean; saved: boolean;
  snapshot: Pick<OpportunityInput,"title"|"description"|"type"|"country"|"department"|"mode"|"language"|"category"|"opensOn"|"closesOn">;
  publishedAt: string;
  amount: {state:"unknown"|"undisclosed"|"zero"} | {state:"range";min:number;max:number;currency:string};
  period: string | null;
  methods: {external:boolean;interest:boolean;event:string|null};
  reasons?: typeof opportunityDiscoveryReasons[number][];
};
export type OpportunityDiscoveryPage = {
  state: "closed"|"available"|"personalization_disabled"|"preferences_incomplete";
  items: (OpportunityDiscoveryItem | {id:string;unavailable:true;saved:true})[];
  next: string | null; version: number;
  dimensions?: OpportunityDiscoveryConfiguration["dimensions"];
  types?: OpportunityDiscoveryConfiguration["types"];
  scopes?: OpportunityDiscoveryConfiguration["scopes"];
};
export type OpportunityPreferenceSkill = {code:string;proficiency:"beginner"|"intermediate"|"advanced"};
export type OpportunityDiscoveryPreferences = {
  types: OpportunityInput["type"][]; interests: OpportunityInput["category"][]; skills: OpportunityPreferenceSkill[];
  experience: number|null; countries: string[]; departments:string[]; modes: OpportunityInput["mode"][];
  languages: OpportunityInput["language"][]; objectives:string;
  compensation: {minimum:number;currency:string;period:string}|null;
};
export type OpportunityPreferenceView = {
  enabled:boolean; version:number; preferences:OpportunityDiscoveryPreferences;
  fields:OpportunityDiscoveryConfiguration["fields"]; types:OpportunityDiscoveryConfiguration["types"];
  scopes:OpportunityDiscoveryConfiguration["scopes"]; expiresOn:string|null; consent:boolean; paused:boolean;
  personalizationAvailable?: boolean;
};

export type OpportunityFounderView = {
  settings: OpportunitySettings; defaults: OpportunitySettings; version: number; live: false;
  history: { version: number; reason: string; registered_at: string }[];
};
