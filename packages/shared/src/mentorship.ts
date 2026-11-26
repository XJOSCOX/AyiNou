import type { Locale } from "./core";
import type { volunteerCategories, volunteerDepartments, volunteerLanguages, volunteerLevels, volunteerModes } from "./volunteering";

export const mentorshipRoles = ["mentor", "mentee"] as const;
export const mentorshipTopics = ["beginner_guidance", "career_development", "entrepreneurship", "professional_development",
  "educational_guidance", "technical_development", "leadership", "professional_communication", "business_development",
  "skilled_trades", "language_learning"] as const;
export const mentorshipOptionalFields = ["experience", "summary", "goals"] as const;
export const mentorshipGeographies = ["haiti_departments", "haiti_nationwide", "international", "worldwide_remote"] as const;
export const mentorshipConsents = ["recommendations", "discovery", "requests"] as const;

export type MentorshipRole = typeof mentorshipRoles[number];
export type MentorshipTopic = typeof mentorshipTopics[number];
export type MentorshipConsent = typeof mentorshipConsents[number];
export type MentorshipSkill = {
  code: string;
  names: Record<Locale, string>;
  version: number;
  status: "active" | "retired" | "draft";
};
export type MentorshipStatus = "incomplete" | "unavailable" | "expired" | "available";
export type MentorshipPreferences = {
  topics: MentorshipTopic[];
  skills: { code: string; proficiency: typeof volunteerLevels[number] }[];
  languages: { code: typeof volunteerLanguages[number]; proficiency: typeof volunteerLevels[number] }[];
  mode: typeof volunteerModes[number];
  geography: typeof mentorshipGeographies[number];
  departments: (typeof volunteerDepartments[number])[];
  countries: string[];
  weeklyHours: number;
  sessionMinutes: number;
  durationWeeks: number;
  capacity: number | null;
  expiresOn: string | null;
  summary: string;
  experience: number | null;
  goals: string;
  learningObjectives: string;
};
export type MentorshipConfiguration = {
  roles: MentorshipRole[];
  topics: MentorshipTopic[];
  fields: (typeof mentorshipOptionalFields[number])[];
  skillCategories: (typeof volunteerCategories[number])[];
  modes: (typeof volunteerModes[number])[];
  geographies: (typeof mentorshipGeographies[number])[];
  maxWeeklyHours: number;
  maxSessionMinutes: number;
  maxDurationWeeks: number;
  maxCapacity: number;
};
export type MentorshipProfile = {
  id: string;
  role: MentorshipRole;
  version: number;
  status: MentorshipStatus;
  paused: boolean;
  adult: boolean;
  participation: boolean;
  safeguarding: boolean;
  preferences: MentorshipPreferences;
  consent: Record<MentorshipConsent, boolean> & { public: false };
  skills: (MentorshipSkill & { selectedVersion: number })[];
};
export type MentorshipOwnerView = {
  intake: boolean;
  mentorIdentity: boolean;
  nativeDiscovery: boolean;
  profiles: MentorshipProfile[];
  volunteerSkills: MentorshipSkill[];
  configuration: MentorshipConfiguration;
};
export type MentorshipFounderView = {
  version: number;
  live: false;
  configuration: MentorshipConfiguration;
  safeguardingPlan: string;
  readinessNotes: string;
  history: { version: number; reason: string; recordedAt: string }[];
};
