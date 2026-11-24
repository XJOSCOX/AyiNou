import type { InterestCode } from "./accounts.js";
import type { OperationalOrganization } from "./institutions.js";
import type { PersonalClaim } from "./trust.js";

export const projectOwners = ["individual", "organization", "community"] as const;
export const projectReviewActions = ["assign", "release", "request_changes", "approve", "reject"] as const;
export const projectReportCategories = ["misleading", "privacy", "unsafe", "fundraising"] as const;
export type ProjectOwnerKind = (typeof projectOwners)[number];
export type ProjectReviewAction = (typeof projectReviewActions)[number];
export type ProjectReportCategory = (typeof projectReportCategories)[number];
export type ProjectStatus = "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "rejected";
export type ProjectProposal = {
  title: string; description: string; problem: string; solution: string; objectives: string; beneficiaries: string; outcomes: string;
  category: InterestCode; country: string; department: string | null; startDate: string | null; endDate: string | null;
  references: string[]; publishRequested: boolean;
};
export type ProjectDraft = { kind: ProjectOwnerKind; owner: string | null; association: string | null; proposal: ProjectProposal };
export type ProjectCard = {
  id: string; status: ProjectStatus; title: string; category: InterestCode; department: string | null; country: string;
  publishedAt: string | null; hasImage: boolean;
  owner: { kind: ProjectOwnerKind; name: string | null; handle: string | null;
    personalClaims?: PersonalClaim[] | null; founderVerified?: true | null };
  association: { name: string; handle: string } | null;
};
export type ProjectIdentityState = "verified" | "required" | "pending" | "revoked";
export type ProjectDetail = ProjectCard & {
  proposal: ProjectProposal; version: number | null; restricted: boolean; canEdit: boolean; canSubmit: boolean;
  submissionIdentity: ProjectIdentityState | null;
  publicationEligibility: "published" | "private" | "pending_institution_verification" | "unavailable" | null;
  revisionPending?: boolean; canPublish?: boolean; canUnpublish?: boolean;
  canDecide: boolean; canReport: boolean; canOpenWork?: boolean;
  approval?: { version: number; proof: string; founderOwned: boolean } | null;
  history: { action: "submit" | "request_changes" | "approve" | "reject" | "restrict" | "publish" | "unpublish"; revision: number; reason: string | null; createdAt: string }[];
};
export type ProjectOptions = {
  submissionIdentity: ProjectIdentityState;
  individualSubmissionIdentity?: ProjectIdentityState;
  organizations: OperationalOrganization[]; communities: (OperationalOrganization & { canOwn: boolean })[];
  canReview: boolean; canModerate: boolean; canAssignOthers: boolean;
};
export type ProjectReviewItem = Pick<ProjectCard, "id" | "title" | "category" | "status"> & {
  version: number; assigned: boolean; assignedToMe: boolean; canClaim: boolean; founderOwned?: boolean;
};
export type ProjectReport = {
  id: string; projectId: string; title: string; version: number; restricted: boolean; category: ProjectReportCategory; explanation: string;
};
