import type { InterestCode } from "./accounts.js";
import type { Locale } from "./core.js";
import type { FeedAuthor } from "./feed.js";
import type { OperationalOrganization } from "./institutions.js";
export * from "./core";
export * from "./trust";
export * from "./accounts";
export * from "./institutions";
export * from "./ambassadors";
export * from "./communities";
export * from "./feed";
export { departmentCommunityContent, type DepartmentCommunityContent } from "./department-community-content";

export const notificationPreferenceKeys = ["reactions", "comments", "replies", "followers"] as const;
export type NotificationPreferences = Record<(typeof notificationPreferenceKeys)[number], boolean>;
export interface MemberNotification {
  id: string;
  createdAt: string;
  readAt: string | null;
  available: boolean;
  kind: "post_reaction" | "post_comment" | "comment_reply" | "new_follower" | "appeal_decided" |
    "verification_decided" | "verification_appeal_decided" | "representative_access_changed" |
    "ambassador_invited" | "ambassador_updated" | "organization_access_changed" |
    "project_submitted" | "project_assigned" | "project_changes" | "project_approved" | "project_rejected" | "project_operation" | "poll_event" | null;
  pollEvent?: { pollId: string; action: PollNotice } | null;
  projectOperation?: { projectId: string; action: ProjectOperationEvent | ProjectProgressEvent } | null;
  appealId?: string | null;
  postId: string | null;
  commentId: string | null;
  actor: Omit<FeedAuthor, "avatarUrl"> | null;
}
export type NotificationPage = { notifications: MemberNotification[]; nextCursor: string | null };

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
  publishedAt: string | null; hasImage: boolean; owner: { kind: ProjectOwnerKind; name: string | null; handle: string | null };
  association: { name: string; handle: string } | null;
};
export type ProjectIdentityState = "verified" | "required" | "pending" | "revoked";
export type ProjectDetail = ProjectCard & {
  proposal: ProjectProposal; version: number | null; restricted: boolean; canEdit: boolean; canSubmit: boolean;
  submissionIdentity: ProjectIdentityState | null;
  publicationEligibility: "published" | "private" | "pending_institution_verification" | "unavailable" | null;
  canDecide: boolean; canReport: boolean; canOpenWork?: boolean;
  history: { action: "submit" | "request_changes" | "approve" | "reject" | "restrict"; revision: number; reason: string | null; createdAt: string }[];
};
export type ProjectOptions = {
  submissionIdentity: ProjectIdentityState;
  organizations: OperationalOrganization[]; communities: (OperationalOrganization & { canOwn: boolean })[];
  canReview: boolean; canModerate: boolean; canAssignOthers: boolean;
};
export type ProjectReviewItem = Pick<ProjectCard, "id" | "title" | "category" | "status"> & {
  version: number; assigned: boolean; assignedToMe: boolean; canClaim: boolean;
};
export type ProjectReport = {
  id: string; projectId: string; title: string; version: number; restricted: boolean; category: ProjectReportCategory; explanation: string;
};
export const projectTeamRoles = ["manager", "supervisor", "contributor", "volunteer"] as const;
export const projectExecutionStatuses = ["approved", "active", "paused", "completed", "archived"] as const;
export const projectTaskPriorities = ["low", "normal", "high"] as const;
export type ProjectTeamRole = (typeof projectTeamRoles)[number];
export type ProjectExecutionStatus = (typeof projectExecutionStatuses)[number];
export type ProjectTaskPriority = (typeof projectTaskPriorities)[number];
export type ProjectOperationEvent = "execution_status" | "invite" | "invite_accept" | "invite_decline" | "invite_revoke" |
  "member_revoke" | "opportunity_publish" | "opportunity_close" | "volunteer_apply" | "volunteer_offer" | "volunteer_reject" |
  "volunteer_confirm" | "volunteer_withdraw" | "task_create" | "task_edit" | "task_assign" | "task_accept" | "task_decline" |
  "task_progress" | "task_block" | "task_submit" | "task_approve" | "task_return" | "task_cancel" | "task_unassigned";
export type ProjectWorkPerson = { id: string; name: string | null; handle: string | null };
export type ProjectWorkTask = {
  milestoneId?: string | null;
  canCoordinate?: boolean;
  id: string; title: string; description: string; priority: ProjectTaskPriority; sensitive: boolean; dueOn: string | null;
  status: "todo" | "in_progress" | "blocked" | "submitted" | "completed" | "cancelled";
  version: number; assigned: boolean; mine: boolean; accepted: boolean; assignee: ProjectWorkPerson | null;
};
export type ProjectWork = {
  projectId: string; title: string; status: ProjectExecutionStatus; version: number; role: ProjectTeamRole | "owner" | "delegate" | null;
  identity: ProjectIdentityState; canApply: boolean;
  team: { person: ProjectWorkPerson | null; role: ProjectTeamRole; eligible: boolean; mine: boolean }[];
  invites: { id: string; role: ProjectTeamRole; expiresAt: string; recipient: ProjectWorkPerson | null; mine: boolean }[];
  opportunities: { id: string; title: string; description: string; skills: string; commitment: string;
    remote: boolean; capacity: number; closesOn: string | null; open: boolean }[];
  applications: { id: string; opportunityId: string; status: "pending" | "offered" | "accepted" | "rejected" | "withdrawn";
    feedback: string | null; title: string; applicant: ProjectWorkPerson | null; mine: boolean }[];
  tasks: ProjectWorkTask[];
  activity: { id: string; action: ProjectOperationEvent | ProjectProgressEvent; date: string; taskId: string | null; detail: string | null }[];
};
export type ProjectWorkIndex = {
  work: { id: string; title: string; status: ProjectExecutionStatus }[];
  opportunities: { id: string; projectId: string; title: string; remote: boolean }[];
};

export const pollKinds = ["community", "priority", "decision", "person"] as const;
export const pollScopes = ["individual", "community", "organization", "project"] as const;
export const pollDecisions = ["recommend", "defer", "decline"] as const;
export type PollScope = (typeof pollScopes)[number];
export type PollKind = (typeof pollKinds)[number];
export type PollStatus = "draft" | "scheduled" | "open" | "awaiting_close" | "closed" | "cancelled";
export type PollEvent = "created" | "edited" | "published" | "finalized" | "cancelled" | "decision_recorded" |
  "nomination_accepted" | "nomination_declined" | "nomination_withdrawn";
export type PollNotice = "nomination_requested" | "finalized" | "cancelled" | "decision_recorded";
export type PollCard = {
  id: string; title: string; kind: PollKind; scope: PollScope; language: Locale;
  scopeName: string | null; status: PollStatus; policy: "advisory" | "governance"; closesAt: string; createdAt: string;
};
export type PollConfiguration = {
  title: string; description: string; language: Locale; audience: "members" | "scope"; eligibility: "active" | "verified";
  resultPolicy: "after_vote" | "after_close"; opensAt: string; closesAt: string; quorum: number | null; threshold: number | null;
};
export type PollResults = {
  total: number; options: { id: string; votes: number; percentage: number }[]; outcome: "no_votes" | "no_quorum" | "tie" |
    "withdrawn_leads" | "below_threshold" | "winner" | null; winnerId: string | null; quorumMet: boolean | null; thresholdMet: boolean | null;
};
export type PollDetail = PollCard & PollConfiguration & {
  scopeId: string | null; taskId: string | null; proposalRevision: number | null; finalizedAt: string | null;
  electorateSize: number | null; canManage: boolean; canVote: boolean; canModerate: boolean; version: number | null;
  ownBallot: string | null; results: PollResults | null; cancellationReason: string | null;
  decision: { disposition: (typeof pollDecisions)[number]; recommendedOptionId: string | null; reason: string; at: string } | null;
  options: { id: string; position: number; label: string | null; handle: string | null; available: boolean;
    consent: "pending" | "accepted" | "declined" | "withdrawn" | null }[];
  events: { id: string; action: PollEvent; version: number; reason: string | null; at: string }[];
};
type PollScopeOption = { id: string; name: string };
export type PollConfigOptions = {
  identity: ProjectIdentityState; communities: (PollScopeOption & { memberAudience: boolean })[];
  organizations: PollScopeOption[]; projects: (PollScopeOption & { tasks: PollScopeOption[] })[];
};
export type PollNomination = {
  id: string; pollId: string; title: string | null; description: string | null; language: Locale;
  consent: "pending" | "accepted"; canRespond: boolean;
};
export const projectProgressKinds = ["update", "evidence", "report"] as const;
export const projectProgressEvents = [
  "milestone_create", "milestone_edit", "milestone_assigned", "milestone_start", "milestone_block", "milestone_submit",
  "milestone_submitted", "milestone_approve", "milestone_approved", "milestone_return", "milestone_returned", "milestone_cancel",
  "milestone_hide", "task_milestone", "metric_create", "metric_edit", "metric_observe", "entry_create", "entry_edit", "entry_image",
  "entry_submit", "entry_approve", "entry_return", "entry_reject", "entry_withdraw", "entry_remove_image", "team_update_shared",
  "report_submitted", "report_returned", "report_rejected", "report_published",
  "progress_project_completed",
] as const;
export type ProjectProgressEvent = (typeof projectProgressEvents)[number];
export type ProjectMilestone = {
  id: string; title: string; description: string; startsOn: string | null; targetOn: string | null;
  target: number | null; unit: string | null; displayOrder: number; publicRequested: boolean; updatedAt: string;
  status: "planned" | "in_progress" | "submitted" | "completed" | "blocked" | "cancelled";
  version: number | null; responsibleId: string | null; mine: boolean; canReview: boolean; canApprove: boolean;
};
export type ProjectMeasurement = {
  id: string; actual: number; startsOn: string; endsOn: string; explanation: string | null; reference: string | null;
  source: "self_reported";
};
export type ProjectMetric = {
  id: string; name: string; unit: string; target: number; version: number; observations: ProjectMeasurement[];
};
export type ProjectProgressContent = {
  title: string; description: string; summary: string; language: Locale; references: string[]; includeMetrics: boolean;
  unfinished?: string; challenges?: string; lessons?: string; nextSteps?: string; correction?: string;
};
export type ProjectProgressEntry = {
  id: string; kind: (typeof projectProgressKinds)[number]; visibility: "team" | "public";
  state: "draft" | "submitted" | "returned" | "approved" | "withdrawn" | "rejected";
  milestoneId: string | null; supersedesId: string | null; superseded: boolean; content: ProjectProgressContent;
  snapshot: { objectives: string | null; completedOn: string | null; milestones: { title: string; date: string }[] | null;
    metrics: (Pick<ProjectMeasurement, "actual" | "startsOn" | "endsOn" | "source"> & { name: string; unit: string; target: number })[] | null } | null;
  hasImage: boolean; reviewed: boolean; approvedAt: string | null; updatedAt: string; version: number | null; mine: boolean; canReview: boolean;
};
export type ProjectProgress = {
  status: Exclude<ProjectExecutionStatus, "approved">; completedOn: string | null; role: ProjectWork["role"]; canManage: boolean;
  milestones: ProjectMilestone[]; entries: ProjectProgressEntry[]; metrics: ProjectMetric[];
  history: { id: string; action: ProjectProgressEvent; subjectId: string; reason: string | null; at: string }[];
  taskCount: number | null; milestoneCount: number;
};
