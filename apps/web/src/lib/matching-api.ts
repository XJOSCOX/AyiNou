import type { MatchingAdmin, MatchingPage, OpportunityCandidate, VolunteerRecommendation } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export const recommendationsPath = "/settings/volunteering/recommendations";
const owner = "/api/v1/me/volunteer-matches";
const admin = "/api/v1/admin/volunteer-settings/matching";
const opportunity = (projectId: string, opportunityId: string) =>
  "/api/v1/projects/" + projectId + "/work/requirements/" + opportunityId;
const headers = (workspace: string) => ({ "X-Ayinou-Workspace":workspace });
export type MemberMatchingPage = MatchingPage<VolunteerRecommendation> & { paused?: boolean; pauseVersion?: number; hasProfile?: boolean };

export const loadRecommendations = (filters: URLSearchParams, signal: AbortSignal): Promise<MemberMatchingPage> =>
  authorizedSocialRequest(owner + "?" + filters, { signal, cache:"no-store" });
export const changeMatchingPause = (body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(owner, { method:"PATCH", body, cache:"no-store" });
export const dismissRecommendation = (project: string, id: string, revision: number): Promise<{ dismissed: boolean }> =>
  authorizedSocialRequest(opportunity(project,id) + "/dismiss", { method:"POST", body:JSON.stringify({ revision }), cache:"no-store" });
export const loadCandidates = (project: string, id: string, cursor: string, signal: AbortSignal): Promise<MatchingPage<OpportunityCandidate>> =>
  authorizedSocialRequest(opportunity(project,id) + "/candidates" + (cursor ? "?" + new URLSearchParams({ cursor }) : ""), { signal, cache:"no-store" });
export const loadMatchingSettings = (workspace: string, signal: AbortSignal): Promise<MatchingAdmin> =>
  authorizedSocialRequest(admin,{ signal,cache:"no-store",headers:headers(workspace) });
export const changeMatchingSettings = (workspace: string, body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(admin,{ method:"PATCH",body,cache:"no-store",headers:headers(workspace) });
