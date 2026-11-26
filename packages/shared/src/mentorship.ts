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
export const mentorshipReportCategories = ["harassment", "unwanted_contact", "impersonation", "misrepresentation",
  "solicitation", "exploitation", "unsafe_activity", "privacy"] as const;
export const mentorshipRequestStates = ["pending", "accepted", "declined", "withdrawn", "expired", "invalidated"] as const;
export const mentorshipRelationshipStates = ["agreement_pending", "active", "paused", "completed", "ended", "safety_restricted"] as const;
export const mentorshipCompatibilityReasons = ["topicFit", "topicMismatch", "languageFit", "languageMismatch", "skillMissing", "skillGrowth",
  "skillFit", "skillMismatch", "modeFit", "modeMismatch", "geographyFit", "geographyMismatch", "timingFit", "timingMismatch", "experienceMissing", "experienceReported"] as const;
export const mentorshipCoordinationLimits = {
  recommendationLimit: [1, 12], senderDaily: [1, 5], recipientDaily: [1, 5],
  outstanding: [1, 5], expiryDays: [1, 14], cooldownDays: [14, 90], capacity: [1, 8],
  agreementWeeks: [1, 52], sessionDays: [7, 90], sessionMinutes: [15, 120],
} as const;
export const mentorshipConsiderations = ["skills", "timing", "experience"] as const;
export type MentorshipCoordinationSettings = Record<keyof typeof mentorshipCoordinationLimits, number> & {
  considerations: (typeof mentorshipConsiderations[number])[];
  safeguardingSince: string; safeguardingNotes: string; moderationNotes: string;
};
export type MentorshipCoordinationPreparation = {
  version: number; settings: MentorshipCoordinationSettings; live: false;
  stages: Record<"intake" | "matching" | "discovery" | "requests" | "coordination", false>;
  history: { version: number; reason: string; recordedAt: string }[];
};
export type MentorshipCandidate = {
  name: string; username: string; role: MentorshipRole; identityVerified: boolean;
  selection: string; canRequest: boolean; classification: "strong" | "partial" | "additional";
  reasons: (typeof mentorshipCompatibilityReasons[number])[];
};
export type MentorshipRequest = {
  id: string; state: typeof mentorshipRequestStates[number]; version: number;
  direction: "sent" | "received"; role: MentorshipRole; createdAt: string; expiresAt: string;
  relationship: string | null; introduction: string | null; reported: boolean;
  peer: Pick<MentorshipCandidate, "name" | "username" | "identityVerified"> | null;
};
export type MentorshipPage<T> = { state: "closed" | "unavailable" | "available"; items: T[]; next: string | null; requestsOpen?: boolean };
export type MentorshipAgreementTerms = {
  title: string; objectives: string; expectations: string;
  weeks: number; frequency: number; minutes: number;
  mode: typeof volunteerModes[number]; topics: MentorshipTopic[];
  free: true; safeguarding: true;
};
export type MentorshipItemContent = { text: string } | {
  localStart: string; timeZone: string; minutes: number; topic: string; startsAt: string;
};
export type MentorshipItem = {
  id: string; version: number; kind: "objective" | "session" | "progress";
  state: "proposed" | "agreed" | "declined" | "cancelled" | "completion_pending" | "completed" | "recorded";
  proposed: MentorshipItemContent | null; accepted: MentorshipItemContent | null;
  mine: boolean | null; objective: string | null;
};
export type MentorshipWorkspace = {
  id: string; request: string; role: MentorshipRole; version: number;
  state: typeof mentorshipRelationshipStates[number]; reported: boolean; completion: "mine" | "peer" | null;
  limits: Pick<MentorshipCoordinationSettings, "agreementWeeks" | "sessionDays" | "sessionMinutes"> & {
    topics: MentorshipTopic[]; modes: MentorshipPreferences["mode"][];
  };
  agreement?: { revision: number; terms: MentorshipAgreementTerms; mine: boolean; peer: boolean } | null;
  agreedTerms?: MentorshipAgreementTerms | null;
  coordinationPaused?: boolean;
  items?: MentorshipItem[];
  history?: { action: string; state: string; version: number; at: string; mine: boolean; item: string | null; correction: MentorshipItemContent | null }[];
};

export type MentorshipFounderView = {
  version: number;
  live: false;
  configuration: MentorshipConfiguration;
  safeguardingPlan: string;
  readinessNotes: string;
  history: { version: number; reason: string; recordedAt: string }[];
};
