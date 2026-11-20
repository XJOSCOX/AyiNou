import { createClient } from "@supabase/supabase-js";
import type { PrivacyRequestDetail, PrivacyRequestKind, PrivacyRequestReceipt, PrivacyRequestSummary } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import type { VerifiedSession } from "./auth.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

export type PrivacyCommand =
  | { operation: "create"; kind: PrivacyRequestKind }
  | { operation: "withdraw"; id: string; version: number };

export interface PrivacyRepository {
  list(identity: VerifiedSession, after?: string): Promise<PrivacyRequestSummary[]>;
  detail(identity: VerifiedSession, id: string): Promise<PrivacyRequestDetail>;
  command(identity: VerifiedSession, operation: PrivacyCommand, key: string, requestId: string): Promise<PrivacyRequestReceipt>;
}

const databaseErrors = {
  PT400: ["INVALID_INPUT", 400, "Check the submitted fields"],
  PT401: ["UNAUTHORIZED", 401, "Sign in to continue"],
  PT429: ["RATE_LIMITED", 429, "Wait before trying again"],
} as const;

export function createPrivacyRepository(config: ApiConfig): PrivacyRepository | null {
  if (config.AYINOU_PRIVACY_INTAKE !== "synthetic" || !config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null;
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: supabaseDatabaseOptions,
    global: { fetch: supabaseFetch(5_000) },
  });

  async function rpc<T>(name: string, identity: VerifiedSession, parameters: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, {
      p_actor: identity.actor, p_session: identity.session, p_aal2: identity.aal2, ...parameters,
    });
    if (!error && data !== null) return data as T;
    if (error?.code === "PT404") {
      throw new ApiError(404, error.message === "PRIVACY_DISABLED" ? "PRIVACY_DISABLED" : "NOT_FOUND", "Privacy request unavailable");
    }
    if (error?.code === "PT409") {
      const code = error.message === "PRIVACY_KEY_CONFLICT" ? "PRIVACY_KEY_CONFLICT" : "PRIVACY_STATE_CONFLICT";
      throw new ApiError(409, code, "Privacy request conflict");
    }
    const mapped = databaseErrors[error?.code as keyof typeof databaseErrors];
    if (mapped) throw new ApiError(mapped[1], mapped[0], mapped[2]);
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Privacy request service unavailable");
  }

  return {
    list: (identity, after) => rpc("privacy_cases_for_api", identity, { p_id: null, p_after: after ?? null }),
    detail: (identity, id) => rpc("privacy_cases_for_api", identity, { p_id: id, p_after: null }),
    command: (identity, operation, key, requestId) => rpc("privacy_case_command_for_api", identity, {
      p_operation: operation.operation, p_key: key, p_request: requestId,
      p_kind: operation.operation === "create" ? operation.kind : null,
      p_id: operation.operation === "withdraw" ? operation.id : null,
      p_version: operation.operation === "withdraw" ? operation.version : null,
    }),
  };
}
