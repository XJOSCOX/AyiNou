import type { ModerationPolicy } from "@ayinou/shared";
import { authorizedRequest } from "./api";

export const moderationPolicyPath = "/api/v1/admin/moderation-policy";

export function loadModerationActionPolicy(workspace: string, signal: AbortSignal): Promise<ModerationPolicy> {
  return authorizedRequest("/api/v1/moderation/action-policy", {
    headers: { "X-Ayinou-Workspace": workspace }, signal, cache: "no-store",
  });
}
