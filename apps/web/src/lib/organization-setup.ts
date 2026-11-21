import type { OrganizationRegistration, OrganizationRegistrationStatus } from "@ayinou/shared";
import { authorizedRequest } from "./api";
import en from "@/messages/organization-setup/en.json";
import es from "@/messages/organization-setup/es.json";
import fr from "@/messages/organization-setup/fr.json";
import ht from "@/messages/organization-setup/ht.json";

export const organizationSetupMessages = { en, es, fr, ht };
export const organizationSetupPath = "/api/v1/me/organization-onboarding";

export function correctRegistration(id: string, status: OrganizationRegistrationStatus, expectedVersion: number, requestId: string,
  actor: string, signal: AbortSignal): Promise<OrganizationRegistration & { auditId: string }> {
  return authorizedRequest(`/api/v1/institutions/${id}/registration`, {
    method: "PUT", body: JSON.stringify({ status, expectedVersion, requestId }), signal,
  }, actor);
}
