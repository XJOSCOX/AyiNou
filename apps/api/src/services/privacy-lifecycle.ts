import type { LifecycleSummary } from "@ayinou/shared";
import { createClient } from "@supabase/supabase-js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import type { VerifiedSession } from "./auth.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

export type LifecycleAction =
  | { action: "preview" | "status" }
  | { action: "plan"; caseVersion: number; key: string }
  | { action: "confirm"; caseVersion: number; planVersion: number; key: string };
export type LifecycleRead = (actor: VerifiedSession, caseId: string, operation: LifecycleAction) => Promise<LifecycleSummary>;

const safeErrors: Record<string, [number, string]> = {
  PRIVACY_DISABLED: [404, "Deletion planning unavailable"],
  LIFECYCLE_DISABLED: [404, "Deletion planning unavailable"],
  NOT_FOUND: [404, "Case unavailable"],
  UNAUTHORIZED: [401, "Sign in to continue"],
  MFA_REQUIRED: [403, "Recent authenticator verification is required"],
  LIFECYCLE_CONFLICT: [409, "The case or plan changed"],
};

export function createPrivacyLifecycle(config: ApiConfig, intakeEnabled: boolean): LifecycleRead | null {
  if (!intakeEnabled || config.AYINOU_PRIVACY_LIFECYCLE !== "synthetic") return null;
  const client = config.SUPABASE_URL && config.SUPABASE_SECRET_KEY
    ? createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }, db: supabaseDatabaseOptions, global: { fetch: supabaseFetch(8_000) },
    }) : null;
  return async (identity, caseId, operation) => {
    const reply = await client?.rpc("lifecycle_subject_for_api", {
      p_actor: identity.actor, p_session: identity.session, p_aal2: identity.aal2, p_totp: identity.totpAt ?? null,
      p_case: caseId, p_action: operation.action,
      ...("key" in operation && { p_case_version: operation.caseVersion, p_key: operation.key }),
      ...("planVersion" in operation && { p_plan_version: operation.planVersion }),
    });
    if (reply && !reply.error && reply.data !== null) return reply.data as LifecycleSummary;
    const code = reply?.error?.message ?? "";
    if (reply?.error?.code.startsWith("PT") && Object.hasOwn(safeErrors, code)) {
      const [status, message] = safeErrors[code];
      throw new ApiError(status, code, message);
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Deletion planning service unavailable");
  };
}
