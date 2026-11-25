import type { Locale } from "./core";

export const impactDepartments = ["HT-AR", "HT-CE", "HT-GA", "HT-NI", "HT-ND", "HT-NE", "HT-NO", "HT-OU", "HT-SD", "HT-SE"] as const;
export const impactSectors = ["education", "healthcare", "agriculture", "environment", "infrastructure",
  "economic_development", "community_development"] as const;
export type ImpactSector = (typeof impactSectors)[number];
export const impactIndicators = ["completed", "reviewed", "supported", "participating", "linkedNeeds"] as const;
export type ImpactIndicator = (typeof impactIndicators)[number];
export type ImpactValue = { state: "available"; value: number } | { state: "unavailable" | "suppressed"; value: null };
export type ImpactDefinition = {
  code: string; version: number; sector: ImpactSector; unit: string; classification: "output" | "outcome";
  names: Record<Locale, string>; descriptions: Record<Locale, string>; methods: Record<Locale, string>; units: Record<Locale, string>;
  methodologyCode: string; aggregatable: boolean; privacy: "public_nonsensitive" | "restricted";
  period: "calendar_year"; deduplication: "independent_delivery_reference"; status: "draft" | "active" | "retired";
};
export type ImpactReport = Record<ImpactIndicator, ImpactValue> & {
  measurements: { definition: ImpactDefinition; result: ImpactValue }[];
  projects: { id: string; title: string }[];
};
export type ImpactFilters = { departments: string[]; years: number[]; sectors: ImpactSector[] };
export type ImpactResponse = { state: "disabled"; operations?: true } |
  { state: "unavailable" | "suppressed"; filters: ImpactFilters } |
  { state: "available"; filters: ImpactFilters; report: ImpactReport };
export type ImpactSettings = ImpactFilters & {
  version: number; enabled: boolean; links: boolean; measurements: boolean; needs: boolean;
};
export type ImpactOverview = {
  settings: ImpactSettings | null; globalReviewer: boolean; catalog: ImpactDefinition[];
  releases: { year: number; sector: ImpactSector; version: number; state: "proposed" | "sealed" | "suppressed" | "rejected";
    fingerprint: string; preview: Record<string, ImpactReport> | null }[];
  grants: { id: string; label: string; version: number; expiresAt: string; revoked: boolean }[];
  candidates: { id: string; label: string }[];
  history: { action: string; at: string; reason: string; version: number }[];
};
export type ImpactMapping = {
  id: string; version: number; year: number | null; code: string | null;
  state: "submitted" | "approved" | "rejected" | "withdrawn" | null;
  disclosure: import("./project-outcome-publication").OutcomeDisclosure;
  method: string | null; reviewReference: string | null; catalog: ImpactDefinition[];
};
export type ImpactMappingSummary = Pick<ImpactMapping, "id" | "version" | "year" | "code" | "state"> & { title: string };
