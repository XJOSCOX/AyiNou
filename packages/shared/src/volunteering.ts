import { impactDepartments } from "./impact";
import type { Locale } from "./core";

export const volunteerCategories = ["education", "healthcare", "engineering", "agriculture", "environment", "technology",
  "business", "finance", "administration", "community", "logistics", "communications", "arts", "trades", "languages"] as const;
export const volunteerFields = ["summary", "experience", "languages"] as const;
export const volunteerLevels = ["beginner", "intermediate", "advanced"] as const;
export const volunteerModes = ["remote", "on_site", "hybrid"] as const;
export const volunteerCommitments = ["occasional", "one_three", "four_eight", "nine_plus"] as const;
export const volunteerLanguages = ["ht", "fr", "en", "es", "pt", "de", "ar", "zh", "asl"] as const;
export const volunteerDepartments = impactDepartments;
export type VolunteerCategory = typeof volunteerCategories[number];
export type VolunteerField = typeof volunteerFields[number];
export type VolunteerLevel = typeof volunteerLevels[number];
export type VolunteerConsent = { matching: boolean; discovery: boolean; profileDisplay: boolean };
export type VolunteerSkill = {
  code: string;
  names: Record<Locale, string>;
  descriptions: Record<Locale, string> | null;
  aliases: string[];
  category: VolunteerCategory;
  status: "active" | "draft" | "retired";
  version: number;
};
export type VolunteerProfile = {
  version: number;
  summary: string;
  skills: { code: string; proficiency: VolunteerLevel; experience: number | null }[];
  languages: { code: typeof volunteerLanguages[number]; proficiency: VolunteerLevel }[];
  mode: typeof volunteerModes[number];
  commitment: typeof volunteerCommitments[number];
  departments: (typeof volunteerDepartments[number])[];
  nationwide: boolean;
  availability: "available" | "paused";
  expiresOn: string | null;
  consent: VolunteerConsent;
};
export type VolunteerSettings = {
  version: number;
  categories: VolunteerCategory[];
  fields: VolunteerField[];
};
export type VolunteerOwnerView = {
  intake: boolean;
  profile: VolunteerProfile | null;
  status: "incomplete" | "unavailable" | "expired" | "available";
  catalog: VolunteerSkill[];
  settings: VolunteerSettings;
};
export type VolunteerAdminView = {
  settings: VolunteerSettings;
  catalog: VolunteerSkill[];
  history: { action: "configure" | "define"; version: number; code: string | null; reason: string; at: string }[];
};
