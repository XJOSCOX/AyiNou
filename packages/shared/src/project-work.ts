import type { Locale } from "./core.js";
import type { ProjectIdentityState } from "./projects.js";

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
