import type { InstitutionAccounts, InstitutionInput, InstitutionManagement, OrganizationRole, ReviewApplication, ReviewQueueMode,
  ReviewDecision, VerificationKind, VerificationWorkspace, VerifiedRepresentatives } from "@ayinou/shared";
import { authorizedRequest, encodeProfileImage } from "./api";

const base = "/api/v1/institutions";
const verify = "/api/v1/me/verification";

function post(path: string, body?: object) {
  return authorizedRequest(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
}

export const loadInstitutionAccounts = (signal?: AbortSignal): Promise<InstitutionAccounts> =>
  authorizedRequest("/api/v1/me/institution-accounts", { signal });

export const loadInstitution = (id: string, signal?: AbortSignal): Promise<InstitutionManagement> =>
  authorizedRequest(`${base}/${id}`, { signal });

export function saveInstitution(id: string, input: Partial<InstitutionInput>) {
  return authorizedRequest(`${base}/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadInstitutionLogo(id: string, file: File) {
  const image = await encodeProfileImage(file).catch(() => { throw new Error("INVALID_IMAGE"); });
  await post(`${base}/${id}/logo`, { image });
}

export const inviteRepresentative = (id: string, username: string, role: Exclude<OrganizationRole, "owner">, termDays: number | null) =>
  post(`${base}/${id}/invitations`, { username, role, termDays });

export const resolveInvitation = (id: string, action: "accept" | "revoke") =>
  post(`/api/v1/institution-invitations/${id}/${action}`);

export const revokeRepresentative = (id: string, member: string) => post(`${base}/${id}/representatives/${member}/revoke`);
export const loadVerifiedRepresentatives = (id: string, signal: AbortSignal): Promise<VerifiedRepresentatives> =>
  authorizedRequest(`${base}/${id}/verified-representatives`, { signal });
export const saveRepresentativeConsent = (id: string, publish: boolean): Promise<void> =>
  authorizedRequest(`${base}/${id}/verified-representatives/me`, { method: "PATCH", body: JSON.stringify({ publish }) });

export const loadApplications = (signal?: AbortSignal): Promise<VerificationWorkspace> =>
  authorizedRequest(verify, { signal });

export const submitVerification = (kind: VerificationKind, organizationId: string | null, evidence: string[]) =>
  post(verify, { kind, organizationId, evidence });

export const loadReviewQueue = async (status: ReviewQueueMode, signal?: AbortSignal): Promise<ReviewApplication[]> =>
  (await authorizedRequest(`/api/v1/verification/review?status=${status}`, { signal })).applications;

export const setReviewWork = (id: string, claim: boolean) =>
  authorizedRequest(`/api/v1/verification/review/${id}/work`, { method: "PATCH", body: JSON.stringify({ claim }) });

export const decideApplication = (id: string, decision: ReviewDecision, rationale: string) =>
  post(`/api/v1/verification/review/${id}`, { decision, rationale, conflictFree: true });
