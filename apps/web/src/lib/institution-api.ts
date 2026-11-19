import type { Institution, InstitutionAccounts, InstitutionInput, InstitutionManagement, OrganizationRole, ReviewApplication,
  ReviewDecision, VerificationApplication, VerificationKind } from "@ayinou/shared";
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

export async function readPublicInstitution(handle: string, signal?: AbortSignal): Promise<Institution> {
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${url}${base}/by-handle/${encodeURIComponent(handle)}`, { signal, cache: "no-store" });
  if (response.status === 404) throw new Error("NOT_FOUND");
  if (!response.ok) throw new Error("API_ERROR");
  return (await response.json()).organization;
}

export function createInstitution(input: InstitutionInput): Promise<{ id: string }> {
  return post(base, input);
}

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

export const loadApplications = async (signal?: AbortSignal): Promise<VerificationApplication[]> =>
  (await authorizedRequest(verify, { signal })).applications;

export const submitVerification = (kind: VerificationKind, organizationId: string | null, evidence: string[]) =>
  post(verify, { kind, organizationId, evidence });

export const loadReviewQueue = async (status: "pending" | "approved", signal?: AbortSignal): Promise<ReviewApplication[]> =>
  (await authorizedRequest(`/api/v1/verification/review?status=${status}`, { signal })).applications;

export const decideApplication = (id: string, decision: ReviewDecision, rationale: string) =>
  post(`/api/v1/verification/review/${id}`, { decision, rationale, conflictFree: true });
