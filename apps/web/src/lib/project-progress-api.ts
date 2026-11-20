import type { ProjectProgress, ProjectProgressEvent } from "@ayinou/shared";
import { authorizedImage, publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";
import { readProjectImage } from "./project-api";

export type ProgressSection = "milestones" | "metrics" | "entries";
export type ProgressInput = Record<string, unknown>;
const base = (id: string) => "/api/v1/projects/" + id + "/progress";

export const loadProgress = (id: string, internal: boolean, signedIn: boolean, signal: AbortSignal): Promise<ProjectProgress> =>
  (signedIn ? authorizedSocialRequest : publicRequest)(base(id) + (internal ? "/work" : ""), { signal });

export const changeProgress = (id: string, section: ProgressSection, action: ProjectProgressEvent, input: ProgressInput) =>
  authorizedSocialRequest(base(id) + "/" + section, { method: "POST", body: JSON.stringify({ action, ...input }) });

export const getProgressImage = (id: string, entry: string, signedIn: boolean, signal: AbortSignal) =>
  authorizedImage(base(id) + "/entries/" + entry + "/image", signal, !signedIn);

export async function putProgressImage(id: string, entry: string, version: number, file: File) {
  const image = await readProjectImage(file);
  return authorizedSocialRequest(base(id) + "/entries/" + entry + "/image",
    { method: "PUT", body: JSON.stringify({ image, version }) });
}
