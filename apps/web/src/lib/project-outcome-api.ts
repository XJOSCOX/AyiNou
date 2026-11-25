import type { OutcomePage, OutcomeRequest, OutcomeSource, OutcomeSourceKind, OutcomeSummary } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const base = (project: string) => "/api/v1/projects/" + project + "/outcome-validation";

export const loadOutcomeRequests = (project: string, after: string | null, signal: AbortSignal): Promise<OutcomePage<OutcomeSummary>> =>
  authorizedSocialRequest(base(project) + (after ? "?after=" + after : ""), { signal });

export const loadOutcomeSources = (project: string, sourceKind: OutcomeSourceKind, after: string | null, signal: AbortSignal):
  Promise<OutcomePage<OutcomeSource>> =>
  authorizedSocialRequest(base(project) + "/sources?" + new URLSearchParams({ sourceKind, ...(after && { after }) }), { signal });

export const loadOutcomeRequest = (project: string, id: string, signal: AbortSignal): Promise<OutcomeRequest> =>
  authorizedSocialRequest(base(project) + "/" + id, { signal });

export const changeOutcomeRequest = (project: string, id: string | null, key: string, body: string): Promise<OutcomeRequest> =>
  authorizedSocialRequest(base(project) + (id ? "/" + id : ""), {
    method: id ? "PATCH" : "POST", headers: { "Idempotency-Key": key }, body,
  });
