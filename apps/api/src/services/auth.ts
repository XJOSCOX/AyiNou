import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

export interface AuthVerifier {
  verify(token: string, requireMfa?: boolean): Promise<string | null>;
}

export function createAuthVerifier(config: ApiConfig): AuthVerifier | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) return null;
  if (!config.SUPABASE_SECRET_KEY) return null;
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: supabaseDatabaseOptions,
    global: { fetch: supabaseFetch(4_000) },
  };
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const security = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
  const issuer = `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  const unavailable = () => new ApiError(503, "SERVICE_UNAVAILABLE", "Authentication service unavailable");

  return {
    async verify(token, requireMfa = false) {
      try {
        const { data, error } = await supabase.auth.getClaims(token);
        if (isAuthRetryableFetchError(error)) throw unavailable();
        if (error || !data) return null;
        const claims = data.claims;
        if (
          claims.iss !== issuer ||
          !(claims.aud === "authenticated" || (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))) ||
          claims.role !== "authenticated" ||
          claims.is_anonymous === true ||
          (requireMfa && claims.aal !== "aal2") ||
          typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 ||
          !z.uuid().safeParse(claims.session_id).success ||
          !z.uuid().safeParse(claims.sub).success
        ) return null;
        if (requireMfa) {
          const now = Date.now() / 1000;
          const recentTotp = Array.isArray(claims.amr) && claims.amr.some((entry) =>
            typeof entry === "object" && entry !== null && (entry.method === "totp" || entry.method === "mfa/totp") &&
            typeof entry.timestamp === "number" && entry.timestamp <= now + 30 && entry.timestamp >= now - 900,
          );
          if (!recentTotp) return null;
        }
        const session = await security.rpc("account_session_for_api", {
          p_user: claims.sub, p_session: claims.session_id, p_aal2: claims.aal === "aal2", p_privileged: requireMfa,
        });
        if (session.status === 0 || session.status >= 500 || session.error?.code === "57014") throw unavailable();
        return !session.error && session.data === true ? claims.sub : null;
      } catch (cause) {
        if (cause instanceof ApiError) throw cause;
        if (isAuthRetryableFetchError(cause)) throw unavailable();
        return null;
      }
    },
  };
}
