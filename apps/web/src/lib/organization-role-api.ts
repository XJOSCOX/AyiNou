import type { OperationalOrganization, OrganizationCustomRole, OrganizationRoleInput, OrganizationRoleWorkspace } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const path = (id: string) => `/api/v1/institutions/${id}/roles`;
const write = (url: string, method: "POST" | "PATCH", data: object) =>
  authorizedSocialRequest(url, { method, body: JSON.stringify(data) });

export const loadOperationalOrganizations = (signal: AbortSignal): Promise<{ organizations: OperationalOrganization[] }> =>
  authorizedSocialRequest("/api/v1/me/organization-roles", { signal });
export const loadOrganizationRoles = (id: string, username: string, signal: AbortSignal): Promise<OrganizationRoleWorkspace> =>
  authorizedSocialRequest(path(id) + (username ? `?username=${encodeURIComponent(username)}` : ""), { signal });
export const saveOrganizationRole = (id: string, role: OrganizationCustomRole | null, fields: OrganizationRoleInput): Promise<unknown> =>
  role ? write(`${path(id)}/${role.id}`, "PATCH", { action: "save", version: role.version, ...fields })
    : write(path(id), "POST", fields);
export const deactivateOrganizationRole = (id: string, role: OrganizationCustomRole): Promise<void> =>
  write(`${path(id)}/${role.id}`, "PATCH", { action: "deactivate", version: role.version });
export const assignOrganizationRole = (id: string, role: OrganizationCustomRole, userId: string): Promise<{ id: string }> =>
  write(`${path(id)}/${role.id}/assignments`, "POST", { version: role.version, userId });
export const revokeOrganizationRole = (id: string, role: OrganizationCustomRole, assignmentId: string): Promise<void> =>
  write(`${path(id)}/${role.id}/assignments/${assignmentId}`, "PATCH", { action: "revoke", version: role.version });
