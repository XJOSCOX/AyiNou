import type { PrivateFlow } from "@ayinou/shared";
import type { AdminTab } from "./admin-navigation";
import { authorizedRequest } from "./api";

export const sessionsEndpoint = "/api/v1/me/sessions";
export const workflowsEndpoint = "/api/v1/me/private-workflows";

export function privateFlowPath(flow: Pick<PrivateFlow, "id" | "step">, section: AdminTab = "overview") {
  const path = "/s/" + flow.id + "/" + flow.step;
  return flow.step === "admin" && section !== "overview" ? path + "?section=" + section : path;
}

export function openPrivateFlow(kind: PrivateFlow["kind"], subject: string, sessionId?: string, signal?: AbortSignal): Promise<PrivateFlow> {
  return authorizedRequest(workflowsEndpoint, { method: "POST", body: JSON.stringify({ kind }), signal }, subject, sessionId);
}
