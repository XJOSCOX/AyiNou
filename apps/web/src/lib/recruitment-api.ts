import type { OpportunityRequirementRevision, RequirementDepartment, RequirementMode } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export const recruitmentPath = "/settings/volunteering/invitations";
export type RecruitmentStatus = "pending" | "application_initiated" | "declined" | "withdrawn" | "expired" | "invalidated";
export type RecruitmentTerms = Omit<OpportunityRequirementRevision, "version"> & { revision: number; title: string; projectTitle: string };
export type RecruitmentItem = { id: string; status: RecruitmentStatus; version: number; title: string | null;
  name: string | null; expiresAt: string; createdAt: string };
type RecruitmentPage = { state: "closed" | "ready"; items: RecruitmentItem[]; nextCursor: string | null };
export type InvitationDetail = { state: "closed" } | Pick<RecruitmentItem, "id" | "status" | "version" | "expiresAt" | "name"> & {
  state: "ready"; terms: RecruitmentTerms | null; message: string | null; handle: string | null;
  project: string | null; opportunity: string | null; recipient: boolean; reported: boolean;
};
type Preferences = { state: "closed" } | { state: "ready"; version: number; allowed: boolean; hasProfile: boolean; outreachActive?: boolean };
type Configuration = { version: number; departments: RequirementDepartment[]; modes: RequirementMode[]; expiryDays: number;
  organizerDailyLimit: number; opportunityDailyLimit: number; recipientDailyLimit: number; cooldownDays: number };
type Admin = { settings: Configuration; history: { version: number; reason: string; at: string }[] };

const inbox = "/api/v1/me/volunteer-recruitment";
const admin = "/api/v1/admin/volunteer-settings/recruitment";
const scope = (project: string, opportunity: string) =>
  "/api/v1/projects/" + project + "/work/requirements/" + opportunity + "/recruitment";
const query = (cursor: string) => cursor ? "?" + new URLSearchParams({ cursor }) : "";
const read = <T>(path: string, signal: AbortSignal, headers?: Record<string,string>): Promise<T> =>
  authorizedSocialRequest(path, { signal, headers, cache: "no-store" });
const write = <T = unknown>(path: string, method: "POST" | "PATCH", body: string, headers?: Record<string,string>, signal?: AbortSignal): Promise<T> =>
  authorizedSocialRequest(path, { method, body, headers, signal, cache: "no-store" });
const workspaceHeader = (workspace: string) => ({ "X-Ayinou-Workspace": workspace });

export const loadRecruitmentPreferences = (signal: AbortSignal) => read<Preferences>(inbox + "/preferences", signal);
export const changeRecruitmentConsent = (body: string) => write(inbox + "/preferences", "PATCH", body);
export const loadRecruitmentInbox = (cursor: string, signal: AbortSignal) => read<RecruitmentPage>(inbox + query(cursor), signal);
export const loadRecruitmentSent = (project: string, opportunity: string, cursor: string, signal: AbortSignal) =>
  read<RecruitmentPage>(scope(project, opportunity) + query(cursor), signal);
export const loadRecruitmentInvitation = (id: string, signal: AbortSignal) => read<InvitationDetail>(inbox + "/" + id, signal);
export const changeRecruitmentInvitation = (id: string, body: string) => write<{ changed?: boolean }>(inbox + "/" + id, "PATCH", body);
export const previewRecruitment = (project: string, opportunity: string, selection: string, signal: AbortSignal) =>
  write<RecruitmentTerms>(scope(project, opportunity) + "/preview", "POST", JSON.stringify({ selection }), undefined, signal);
export const sendRecruitment = (project: string, opportunity: string, body: string) => write(scope(project, opportunity), "POST", body);
export const loadRecruitmentSettings = (workspace: string, signal: AbortSignal) => read<Admin>(admin, signal, workspaceHeader(workspace));
export const changeRecruitmentSettings = (workspace: string, body: string) => write(admin, "PATCH", body, workspaceHeader(workspace));
