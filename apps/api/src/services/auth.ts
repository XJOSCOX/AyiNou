import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

export interface AuthVerifier {
  verify(token: string, requireMfa?: boolean): Promise<string | null>;
  verifySession?(token: string, requireMfa?: boolean): Promise<VerifiedSession | null>;
  memberFeatureAccess?(token: string): Promise<boolean | null>;
  ownAccountRestriction?(token: string): Promise<AccountRestriction | null>;
  verifyRestrictedAccount?(token: string): Promise<{ actor: string; restriction: AccountRestriction } | null>;
}

export type AccountRestriction = "suspended" | "banned";

export interface VerifiedSession {
  actor: string;
  session: string;
  aal2: boolean;
  totpAt?: number;
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

  async function readClaims(token: string) {
    const { data, error } = await supabase.auth.getClaims(token);
    if (isAuthRetryableFetchError(error)) throw unavailable();
    if (error || !data) return null;
    const claims = data.claims;
    if (
      claims.iss !== issuer ||
      !(claims.aud === "authenticated" || (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))) ||
      claims.role !== "authenticated" ||
      claims.is_anonymous === true ||
      typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 ||
      !z.uuid().safeParse(claims.session_id).success ||
      !z.uuid().safeParse(claims.sub).success
    ) return null;
    return claims;
  }

  async function verifySession(token: string, requireMfa = false): Promise<VerifiedSession | null> {
    try {
      const claims = await readClaims(token);
      if (!claims || (requireMfa && claims.aal !== "aal2")) return null;
      let totpAt: number | undefined;
      const now = Date.now() / 1000;
      for (const entry of Array.isArray(claims.amr) ? claims.amr : []) {
        if (typeof entry === "object" && entry !== null && (entry.method === "totp" || entry.method === "mfa/totp") &&
          typeof entry.timestamp === "number" && entry.timestamp <= now + 30 && entry.timestamp >= now - 900) {
          totpAt = Math.max(totpAt ?? 0, Math.floor(entry.timestamp));
        }
      }
      if (requireMfa && totpAt === undefined) return null;
      const session = await security.rpc("account_session_for_api", {
        p_user: claims.sub, p_session: claims.session_id, p_aal2: claims.aal === "aal2", p_privileged: requireMfa,
      });
      if (session.status === 0 || session.status >= 500 || session.error?.code === "57014") throw unavailable();
      if (session.error) return null;
      if (session.data !== true) {
        // A signed but expired session remains denied even if its audit write is unavailable.
        await security.rpc("s2a_observe_expiry_for_api", { p_user: claims.sub, p_session: claims.session_id });
        return null;
      }
      return { actor: claims.sub, session: z.uuid().parse(claims.session_id), aal2: claims.aal === "aal2", totpAt };
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (isAuthRetryableFetchError(cause)) throw unavailable();
      return null;
    }
  }

  function asMember(token: string) {
    return createClient(config.SUPABASE_URL!, config.SUPABASE_PUBLISHABLE_KEY!, {
      ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
    });
  }

  async function ownAccountRestriction(token: string): Promise<AccountRestriction | null> {
    const member = asMember(token);
    // This existing self-only RPC validates the signed session and its absolute deadline.
    const { data, error, status } = await member.rpc("m22_my_account_enforcement");
    if (status === 401 || status === 403) return null;
    if (error) throw unavailable();
    if (data === null) return null;
    const result = z.object({ notices: z.array(z.object({ kind: z.string(), status: z.string() })) }).safeParse(data);
    if (!result.success) throw unavailable();
    const active = result.data.notices.filter((notice) => notice.status === "active");
    if (active.some((notice) => notice.kind === "banned")) return "banned";
    return active.some((notice) => notice.kind === "suspended") ? "suspended" : null;
  }

  return {
    verifySession,
    ownAccountRestriction,
    async verifyRestrictedAccount(token) {
      const claims = await readClaims(token);
      if (!claims) return null;
      if (claims.aal !== "aal2") {
        const { data, error } = await asMember(token).auth.getUser(token);
        if (isAuthRetryableFetchError(error)) throw unavailable();
        if (error || data.user?.id !== claims.sub || data.user.factors?.some((factor) => factor.status === "verified")) return null;
      }
      const restriction = await ownAccountRestriction(token);
      return restriction ? { actor: claims.sub, restriction } : null;
    },
    async memberFeatureAccess(token) {
      const member = asMember(token);
      const { data, error, status } = await member.rpc("member_feature_access_for_client");
      if (status === 401 || status === 403) return null;
      if (error) throw unavailable();
      return typeof data === "boolean" ? data : null;
    },
    async verify(token, requireMfa) {
      return (await verifySession(token, requireMfa))?.actor ?? null;
    },
  };
}
