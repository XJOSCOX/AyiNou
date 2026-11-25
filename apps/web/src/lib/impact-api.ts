import type { ImpactMapping, ImpactMappingSummary, ImpactOverview, ImpactResponse, OutcomePage } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

const publicPath = "/api/v1/impact";
const founder = "/api/v1/admin/impact";
const staff = "/api/v1/private/impact-review";
const member = "/api/v1/me/impact";
const withQuery = (path: string, query: Record<string, string>) => {
  const params = new URLSearchParams(query);
  return params.size > 0 ? path + "?" + params : path;
};
const headers = (workspace?: string) => workspace ? { "X-Ayinou-Workspace": workspace } : undefined;
const read = <T>(path: string, signal: AbortSignal, workspace?: string): Promise<T> =>
  authorizedSocialRequest(path, { signal, cache: "no-store", headers: headers(workspace) });
const write = (path: string, body: string, workspace?: string) =>
  authorizedSocialRequest(path, { method: "PATCH", body, cache: "no-store", headers: headers(workspace) });

export const impactReviewPath = "/projects/review/outcomes/impact";
export const loadImpact = (selection: Record<string, string>, signal: AbortSignal): Promise<ImpactResponse> =>
  publicRequest(withQuery(publicPath, selection), { signal, cache: "no-store" });
export const loadFounderImpact = (workspace: string, search: string, signal: AbortSignal) =>
  read<ImpactOverview>(withQuery(founder, search ? { search } : {}), signal, workspace);
export const changeFounderImpact = (workspace: string, body: string) => write(founder, body, workspace);
export const loadImpactOversight = (workspace: string, signal: AbortSignal) => read<ImpactOverview>(staff, signal, workspace);
export const changeImpactOversight = (workspace: string, body: string) => write(staff, body, workspace);
export const loadImpactMappings = (workspace: string, scope: string, id: string, signal: AbortSignal) =>
  read<OutcomePage<ImpactMappingSummary>>(withQuery(staff + "/mappings", { scope, ...(id && { id }) }), signal, workspace);
export const loadImpactMapping = (id: string, signal: AbortSignal, workspace?: string) =>
  read<ImpactMapping>((workspace ? staff : member) + "/mappings/" + id, signal, workspace);
export const changeImpactMapping = (id: string, body: string, workspace?: string) =>
  write((workspace ? staff : member) + "/mappings/" + id, body, workspace);
export const loadImpactNeedConsent = (id: string, signal: AbortSignal) =>
  read<{ consented: boolean; version: number }>(member + "/needs/" + id, signal);
export const changeImpactNeedConsent = (id: string, body: string) => write(member + "/needs/" + id, body);
