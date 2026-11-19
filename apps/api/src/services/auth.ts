import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApiConfig } from "../config.js";

export interface AuthVerifier {
  verify(token: string, requireMfa?: boolean): Promise<string | null>;
}

export function createAuthVerifier(config: ApiConfig): AuthVerifier | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) return null;
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const issuer = `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;

  return {
    async verify(token, requireMfa = false) {
      try {
        const { data, error } = await supabase.auth.getClaims(token);
        if (error || !data) return null;
        const claims = data.claims;
        if (
          claims.iss !== issuer ||
          !(claims.aud === "authenticated" || (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))) ||
          claims.role !== "authenticated" ||
          claims.is_anonymous === true ||
          (requireMfa && claims.aal !== "aal2") ||
          typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 ||
          !z.uuid().safeParse(claims.sub).success
        ) return null;
        if (claims.aal !== "aal2") {
          const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
          if (assurance.error || assurance.data.nextLevel === "aal2") return null;
        }
        return claims.sub;
      } catch {
        return null;
      }
    },
  };
}
