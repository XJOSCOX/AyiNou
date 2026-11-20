import type { ProjectOperationEvent, ProjectWork, ProjectWorkIndex } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export type WorkInput = Record<string, string | number | boolean | null>;
export const loadProjectWork = (id: string, signal: AbortSignal): Promise<ProjectWork> =>
  authorizedSocialRequest("/api/v1/projects/" + id + "/work", { signal });
export const loadProjectWorkIndex = (signal: AbortSignal): Promise<ProjectWorkIndex> =>
  authorizedSocialRequest("/api/v1/me/project-work", { signal });
export const runProjectWork = (id: string, action: ProjectOperationEvent, input: WorkInput) =>
  authorizedSocialRequest("/api/v1/projects/" + id + "/work", { method: "POST", body: JSON.stringify({ action, ...input }) });
