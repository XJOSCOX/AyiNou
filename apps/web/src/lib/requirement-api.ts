import type { OpportunityRequirementsView, RequirementAdminView } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const admin = "/api/v1/admin/volunteer-settings/requirements";
const project = (id: string) => "/api/v1/projects/" + id + "/work/requirements";
export const loadOpportunityRequirements = (id: string, signal: AbortSignal): Promise<OpportunityRequirementsView> =>
  authorizedSocialRequest(project(id), { signal, cache: "no-store" });
export const changeOpportunityRequirements = (id: string, opportunity: string, body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(project(id) + "/" + opportunity, { method: "PATCH", body, cache: "no-store" });
export const loadRequirementSettings = (workspace: string, signal: AbortSignal): Promise<RequirementAdminView> =>
  authorizedSocialRequest(admin, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } });
export const changeRequirementSettings = (workspace: string, body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(admin, { method: "PATCH", body, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } });
