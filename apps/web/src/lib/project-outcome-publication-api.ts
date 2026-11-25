import type { OutcomePage, OutcomePublication, OutcomePublicationReceipt, OutcomePublicationRoster,
  OutcomePublicationStatus, OutcomePublicationSummary, OutcomeStaffLane, PublicOutcomeResult } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

export const outcomePublicationPath = "/projects/review/outcomes/publication";
const base = "/api/v1/private/project-outcome-publication";
const member = (project: string, caseId: string) => "/api/v1/projects/" + project + "/outcome-validation/" + caseId + "/publication";
const withQuery = (path: string, query: Record<string, string>) => path + "?" + new URLSearchParams(query);
const headers = (workspace?: string) => workspace ? { "X-Ayinou-Workspace": workspace } : undefined;
const read = <T>(path: string, signal: AbortSignal, workspace?: string): Promise<T> =>
  authorizedSocialRequest(path, { signal, cache: "no-store", headers: headers(workspace) });
const write = <T>(path: string, method: string, body: string, workspace?: string): Promise<T> =>
  authorizedSocialRequest(path, { method, body, cache: "no-store", headers: headers(workspace) });

export const loadPublicationAvailability = (signal: AbortSignal) => read<boolean>(base + "/availability", signal);
export const openPublicationWorkspace = (lane: OutcomeStaffLane) =>
  write<{ id: string; expiresAt: string }>(base + "/workspace", "POST", JSON.stringify({ lane }));
export const loadMemberPublication = (project: string, id: string, signal: AbortSignal) =>
  read<OutcomePublication>(member(project, id), signal);
export const changeMemberPublication = (project: string, id: string, body: string) =>
  write<OutcomePublicationReceipt>(member(project, id), "PATCH", body);
export const loadPublicationQueue = (workspace: string, lane: OutcomeStaffLane, department: string,
  status: OutcomePublicationStatus | "", after: string | null, signal: AbortSignal) =>
  read<OutcomePage<OutcomePublicationSummary>>(withQuery(base, { lane, department, ...(status && { status }),
    ...(after && { after }) }), signal, workspace);
export const loadPublicationRoster = (workspace: string, department: string, search: string, signal: AbortSignal) =>
  read<OutcomePublicationRoster>(withQuery(base + "/roster", { department, ...(search && { search }) }), signal, workspace);
export const changePublicationRoster = (workspace: string, body: string) =>
  write<OutcomePublicationReceipt>(base + "/roster", "POST", body, workspace);
export const loadStaffPublication = (workspace: string, lane: OutcomeStaffLane, id: string, signal: AbortSignal) =>
  read<OutcomePublication>(withQuery(base + "/" + id, { lane }), signal, workspace);
export const changeStaffPublication = (workspace: string, lane: OutcomeStaffLane, id: string, body: string) =>
  write<OutcomePublicationReceipt>(withQuery(base + "/" + id, { lane }), "PATCH", body, workspace);

export const loadPublicOutcomeResults = (project: string, signedIn: boolean, signal: AbortSignal): Promise<PublicOutcomeResult[]> =>
  (signedIn ? authorizedSocialRequest : publicRequest)("/api/v1/projects/" + project + "/validated-results", { signal, cache: "no-store" });
