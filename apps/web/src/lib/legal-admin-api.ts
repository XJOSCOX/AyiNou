import { authorizedRequest } from "./api";

export type LegalPolicyStatus = {
  policyId: string; state: "draft" | "under_review" | "approved" | "scheduled" | "published" | "suspended" | "superseded" | "withdrawn";
  enabled: boolean; revision: number; releaseVersion: string | null; releaseDigest: string | null;
  effectiveAt: string | null; expiresAt: string | null; eligible: boolean; changedAt: string;
};
export type LegalAdminStatus = {
  global: { enabled: boolean; suspended: boolean; revision: number; changedAt: string };
  policies: LegalPolicyStatus[];
  current: { policyId: string; version: string }[];
  historical: { policyId: string; version: string }[];
  acceptance: { terms: false; privacyAcknowledgment: false; optionalConsent: false; materialNotices: false };
};
export type LegalAudit = {
  id: string; actorId: string | null; scope: "global" | "policy"; policyId: string | null;
  action: "enable" | "disable" | "suspend" | "restore"; reason: string;
  previousEnabled: boolean; nextEnabled: boolean; previousState: string | null; nextState: string | null;
  previousRevision: number; nextRevision: number; occurredAt: string;
};
export const loadAdminLegal = (signal?: AbortSignal): Promise<LegalAdminStatus> =>
  authorizedRequest("/api/v1/admin/legal", { signal, cache: "no-store" });
export async function loadLegalAudit(signal?: AbortSignal): Promise<LegalAudit[]> {
  return (await authorizedRequest("/api/v1/admin/legal/audit", { signal, cache: "no-store" })).events;
}
export function changeLegalAvailability(input: { scope: "global" | "policy"; policyId: string | null;
  action: "enable" | "disable" | "suspend" | "restore"; expectedRevision: number; reason: string }) {
  return authorizedRequest("/api/v1/admin/legal/actions", { method: "POST", cache: "no-store", body: JSON.stringify({
    ...input, requestId: crypto.randomUUID(), confirm: "CHANGE LEGAL AVAILABILITY",
  }) });
}
