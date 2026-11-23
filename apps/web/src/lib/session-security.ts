import type { PrivateFlow } from "@ayinou/shared";
import { authorizedRequest } from "./api";

export const sessionsEndpoint = "/api/v1/me/sessions";
export const workflowsEndpoint = "/api/v1/me/private-workflows";

export function privateFlowPath(flow: Pick<PrivateFlow, "id" | "step">) {
  return "/s/" + flow.id + "/" + flow.step;
}

export function openPrivateFlow(kind: PrivateFlow["kind"], subject: string, sessionId?: string): Promise<PrivateFlow> {
  return authorizedRequest(workflowsEndpoint, { method: "POST", body: JSON.stringify({ kind }) }, subject, sessionId);
}
