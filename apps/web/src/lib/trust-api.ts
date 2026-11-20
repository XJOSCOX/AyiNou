import type { ImpersonationKind, ImpersonationReview, PersonalClaim, VerificationAppeal, VerificationAppealOutcome, VerificationAssignment } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const personal = "/api/v1/me/verification/appeals";
const ops = "/api/v1/trust";
const json = (method: string, payload: object) => ({ method, body: JSON.stringify(payload) });
const path = (id: string) => encodeURIComponent(id);
export const loadVerificationAppeals = (signal: AbortSignal): Promise<{ appeals: VerificationAppeal[] }> => authorizedSocialRequest(personal, { signal });
export const submitVerificationAppeal = (applicationId: string, explanation: string, references: string[]): Promise<{ id: string }> =>
  authorizedSocialRequest(personal, json("POST", { applicationId, explanation, references }));
export const submitImpersonationReport = (username: string, kind: ImpersonationKind, institution: string | null,
  explanation: string, references: string[]): Promise<{ id: string }> =>
  authorizedSocialRequest(`/api/v1/members/${path(username)}/impersonation-reports`, json("POST", { kind, institution, explanation, references }));
export const loadVerificationAssignments = (signal: AbortSignal): Promise<{ applications: VerificationAssignment[] }> =>
  authorizedSocialRequest(`${ops}/application-assignments`, { signal });
export const assignVerificationApplication = (id: string, reviewer: string, reason: string, assign: boolean): Promise<void> =>
  authorizedSocialRequest(`${ops}/applications/${path(id)}/assignment`, json("PATCH", { reviewer, reason, assign }));
export const loadAppealQueue = (view: "assign" | "assigned", signal: AbortSignal): Promise<{ appeals: VerificationAppeal[] }> =>
  authorizedSocialRequest(`${ops}/verification-appeals?view=${view}`, { signal });
export const assignVerificationAppeal = (id: string, reviewer: string, reason: string): Promise<void> =>
  authorizedSocialRequest(`${ops}/verification-appeals/${path(id)}/assignment`, json("PATCH", { reviewer, reason }));
export const decideVerificationAppeal = (id: string, outcome: VerificationAppealOutcome, rationale: string): Promise<void> =>
  authorizedSocialRequest(`${ops}/verification-appeals/${path(id)}/decision`, json("PATCH", { outcome, rationale }));
export const loadImpersonationQueue = (signal: AbortSignal): Promise<{ reports: ImpersonationReview[] }> =>
  authorizedSocialRequest(`${ops}/impersonation`, { signal });
export const decideImpersonation = (id: string, outcome: "dismissed" | "substantiated", rationale: string, hold: PersonalClaim | null): Promise<void> =>
  authorizedSocialRequest(`${ops}/impersonation/${path(id)}/decision`, json("PATCH", { outcome, rationale, hold }));
