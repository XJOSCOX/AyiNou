import type { Locale } from "./core";
import type { VolunteerCategory, VolunteerLevel, VolunteerSettings, VolunteerSkill } from "./volunteering";
import { volunteerDepartments, volunteerLanguages, volunteerModes } from "./volunteering";

export const requirementPriorities = ["required","preferred"] as const;
export const requirementFields = ["experience","languages","screening"] as const;
export type RequirementPriority = typeof requirementPriorities[number];
export type RequirementField = typeof requirementFields[number];
export type RequirementMode = typeof volunteerModes[number];
export type RequirementDepartment = typeof volunteerDepartments[number];
export type RequirementLanguage = typeof volunteerLanguages[number];

export type OpportunityRequirements = {
  skills: {
    code: string;
    priority: RequirementPriority;
    proficiency: VolunteerLevel | null;
    experienceMin: number | null;
    experienceMax: number | null;
  }[];
  languages: { code: RequirementLanguage; priority: RequirementPriority; proficiency: VolunteerLevel | null }[];
  mode: RequirementMode;
  hoursPerWeek: number | null;
  durationWeeks: number | null;
  beginnerFriendly: boolean;
  screening: boolean;
};
export type OpportunityRequirementRevision = Omit<OpportunityRequirements,"skills"> & {
  skills: (OpportunityRequirements["skills"][number] & { skillVersion: number; names: Record<Locale,string> })[];
  version: number;
  projectRevision: number;
  department: RequirementDepartment;
  capacity: number;
  deadline: string | null;
};
export type RequirementSettings = {
  version: number;
  categories: VolunteerCategory[];
  fields: RequirementField[];
  modes: RequirementMode[];
  maxSkills: number;
  maxLanguages: number;
};
export type OpportunityRequirementsView = { state: "closed" } | {
  state: "fixture";
  department: RequirementDepartment | null;
  settings: RequirementSettings;
  catalog: VolunteerSkill[];
  items: { opportunityId: string; version: number; editable: boolean; eligible: boolean;
    published: OpportunityRequirementRevision | null; draft: OpportunityRequirementRevision | null;
    history: { version: number; action: "draft" | "publish"; at: string }[];
  }[];
};
export type RequirementAdminView = {
  settings: RequirementSettings;
  catalogSettings: VolunteerSettings;
  availableSkills: number;
  history: { version: number; reason: string; at: string }[];
};
