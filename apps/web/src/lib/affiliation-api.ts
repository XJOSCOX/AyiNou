import type { AffiliationAction, AffiliationDirectory, AffiliationManagement, AffiliationType, MembershipPolicy, MyAffiliations } from "@ayinou/shared";
import { authorizedRequest, publicRequest } from "./api";

const base = (id: string) => `/api/v1/institutions/${id}/affiliations`;

function mutate(path: string, method: "POST" | "PATCH", input?: object): Promise<void> {
  return authorizedRequest(path, { method, ...(input ? { body: JSON.stringify(input) } : {}) });
}

export async function readAffiliationDirectory(handle: string, signal?: AbortSignal): Promise<AffiliationDirectory> {
  return publicRequest(`/api/v1/institutions/by-handle/${encodeURIComponent(handle)}/affiliations`, { signal });
}

export const loadMyAffiliations = (signal?: AbortSignal): Promise<MyAffiliations> =>
  authorizedRequest("/api/v1/me/affiliations", { signal });

export const loadAffiliationManagement = (id: string, signal?: AbortSignal): Promise<AffiliationManagement> =>
  authorizedRequest(`${base(id)}/manage`, { signal });

export const joinAffiliation = (id: string, affiliationType: AffiliationType, message?: string) =>
  mutate(base(id), "POST", { affiliationType, message });

export const leaveAffiliation = (id: string) => mutate(`${base(id)}/me`, "PATCH", { action: "leave" });
export const setAffiliationConsent = (id: string, listed: boolean) =>
  mutate(`${base(id)}/me`, "PATCH", { action: "set_directory", listed });

export const setAffiliationPolicy = (id: string, membershipPolicy: MembershipPolicy, directoryEnabled: boolean) =>
  mutate(`${base(id)}/policy`, "PATCH", { membershipPolicy, directoryEnabled });

export const decideJoinRequest = (id: string, requestId: string, decision: "approve" | "reject", reason?: string) =>
  mutate(`${base(id)}/requests/${requestId}`, "PATCH", { decision, reason });

export const updateAffiliation = (id: string, affiliationId: string, action: AffiliationAction, affiliationType?: AffiliationType) =>
  mutate(`${base(id)}/members/${affiliationId}`, "PATCH", { action, affiliationType });

export const inviteAffiliate = (id: string, username: string, affiliationType: AffiliationType) =>
  mutate(`${base(id)}/invitations`, "POST", { username, affiliationType });

export const resolveAffiliationInvitation = (id: string, action: "accept" | "revoke") =>
  mutate(`/api/v1/affiliation-invitations/${id}/${action}`, "POST");
