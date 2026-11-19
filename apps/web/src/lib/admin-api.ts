import type { AdminAccount, AdminAccountAction, AdminAuditEvent, AdminOverview, PlatformAccess } from "@ayinou/shared";
import { authorizedRequest } from "./api";

export const loadPlatformAccess = (signal?: AbortSignal): Promise<PlatformAccess> =>
  authorizedRequest("/api/v1/me/platform-access", { signal });

export const loadAdminOverview = (signal?: AbortSignal): Promise<AdminOverview> =>
  authorizedRequest("/api/v1/admin/overview", { signal });

export async function loadAdminAccounts(query: string, offset: number, signal?: AbortSignal): Promise<AdminAccount[]> {
  const parameters = new URLSearchParams({ q: query, offset: String(offset) });
  return (await authorizedRequest(`/api/v1/admin/accounts?${parameters}`, { signal })).accounts;
}

export async function loadAdminAudit(signal?: AbortSignal): Promise<AdminAuditEvent[]> {
  return (await authorizedRequest("/api/v1/admin/audit", { signal })).events;
}

export function changeAdminAccount(id: string, input: AdminAccountAction): Promise<void> {
  return authorizedRequest(`/api/v1/admin/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}
