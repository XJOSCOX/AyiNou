import type { RequirementDepartment, RequirementMode } from "./opportunity-requirements";

export const matchingCriteria = ["preferred","skills","language","schedule","mode","department","beginner"] as const;
export const matchingClasses = ["strong","partial","additional"] as const;
export const matchingReasons = ["skillFit","preferredFit","skillMissing","experienceNeeded","languageFit","languageNeeded",
  "modeFit","modeGap","departmentFit","departmentGap","weeklyFit","weeklyGap","durationGap","unknown","beginner","screening"] as const;
export type MatchingClass = typeof matchingClasses[number];
export type MatchingReason = typeof matchingReasons[number];
export type MatchingSettings = {
  version: number;
  criteria: (typeof matchingCriteria)[number][];
  departments: RequirementDepartment[];
  modes: RequirementMode[];
  requiredWeight: number;
  preferredWeight: number;
  recommendationLimit: number;
  discoveryLimit: number;
};
export type MatchingAdmin = { settings: MatchingSettings; history: { version: number; reason: string; at: string }[] };
export type VolunteerRecommendation = {
  projectId: string;
  opportunityId: string;
  requirementVersion: number;
  title: string;
  department: RequirementDepartment;
  mode: RequirementMode;
  classification: MatchingClass;
  reasons: MatchingReason[];
};
export type MatchingPage<T> = { state: "closed" | "unavailable" | "ready"; items: T[]; nextCursor: string | null };
export type OpportunityCandidate = { handle: string; name: string; classification: MatchingClass; selection?: string };
