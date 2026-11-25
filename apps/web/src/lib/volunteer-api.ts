import type { VolunteerAdminView, VolunteerOwnerView } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const owner = "/api/v1/me/volunteer-profile";
const admin = "/api/v1/admin/volunteer-settings";
const headers = (workspace: string) => ({ "X-Ayinou-Workspace": workspace });
export const loadVolunteer = (signal: AbortSignal): Promise<VolunteerOwnerView> =>
  authorizedSocialRequest(owner, { signal, cache: "no-store" });
export const saveVolunteer = (body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(owner, { method: "PATCH", body, cache: "no-store" });
export const loadVolunteerSettings = (workspace: string, signal: AbortSignal): Promise<VolunteerAdminView> =>
  authorizedSocialRequest(admin, { signal, cache: "no-store", headers: headers(workspace) });
export const saveVolunteerSettings = (workspace: string, body: string): Promise<{ version: number }> =>
  authorizedSocialRequest(admin, { method: "PATCH", body, cache: "no-store", headers: headers(workspace) });
