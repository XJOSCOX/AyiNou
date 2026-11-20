import type { ProjectCard, ProjectDetail, ProjectDraft, ProjectOptions, ProjectProposal, ProjectReport, ProjectReportCategory,
  ProjectReviewAction, ProjectReviewItem } from "@ayinou/shared";
import { authorizedImage, publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

const root = "/api/v1/projects";
const mine = "/api/v1/me/projects";
const body = (method: string, data: object) => ({ method, body: JSON.stringify(data) });

export const loadProjects = (signedIn: boolean, filters: Record<string, string>, cursor: string | null, signal: AbortSignal):
  Promise<{ projects: ProjectCard[]; nextCursor: string | null }> =>
  (signedIn ? authorizedSocialRequest : publicRequest)(`${root}?${new URLSearchParams({ ...filters, ...(cursor ? { cursor } : {}) })}`, { signal });
export const loadProject = (id: string, signedIn: boolean, signal: AbortSignal): Promise<ProjectDetail> =>
  (signedIn ? authorizedSocialRequest : publicRequest)(`${root}/${id}`, { signal });
export const loadProjectImage = (id: string, signedIn: boolean, signal: AbortSignal) =>
  authorizedImage(`${root}/${id}/image`, signal, !signedIn);
export const loadMyProjects = (signal: AbortSignal): Promise<{ projects: (ProjectCard & { createdByMe: boolean; restricted: boolean })[] }> =>
  authorizedSocialRequest(mine, { signal });
export const loadProjectOptions = (signal: AbortSignal): Promise<ProjectOptions> =>
  authorizedSocialRequest(mine + "/options", { signal });
export const createProject = (input: ProjectDraft, key: string): Promise<{ id: string }> =>
  authorizedSocialRequest(root, { ...body("POST", input), headers: { "Idempotency-Key": key } });
export const saveProject = (id: string, version: number, proposal: ProjectProposal, removeImage: boolean): Promise<{ version: number }> =>
  authorizedSocialRequest(`${root}/${id}`, body("PATCH", { version, proposal, removeImage }));
export const submitProject = (id: string, version: number): Promise<{ version: number }> =>
  authorizedSocialRequest(`${root}/${id}/submit`, body("POST", { version }));
export const readProjectImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (file.size > 3_145_728) { reject(new Error("PAYLOAD_TOO_LARGE")); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("INVALID_IMAGE"));
    reader.readAsDataURL(file);
  });
export const uploadProjectImage = (id: string, version: number, file: File): Promise<{ version: number }> =>
  readProjectImage(file).then((image) => authorizedSocialRequest(`${root}/${id}/image`, body("PUT", { version, image })));
export const loadProjectQueue = (signal: AbortSignal): Promise<{ items: ProjectReviewItem[] }> =>
  authorizedSocialRequest(root + "/review", { signal });
export const reviewProject = (id: string, version: number, action: ProjectReviewAction, reason: string, reviewer: string | null = null) =>
  authorizedSocialRequest(`${root}/${id}/review`, body("POST", { version, action, reason, reviewer }));
export const loadProjectReports = (signal: AbortSignal): Promise<{ reports: ProjectReport[] }> =>
  authorizedSocialRequest(root + "/reports", { signal });
export const reportProject = (id: string, category: ProjectReportCategory, explanation: string) =>
  authorizedSocialRequest(`${root}/${id}/reports`, body("POST", { category, explanation }));
export const decideProjectReport = (report: ProjectReport, restrict: boolean, reason: string) =>
  authorizedSocialRequest(`${root}/${report.projectId}/reports/${report.id}`, body("PATCH", { version: report.version, restrict, reason }));
