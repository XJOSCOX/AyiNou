import type { JwtPayload } from "@supabase/supabase-js";

export function recoverySessionId(claims?: JwtPayload) {
  if (!claims?.sub || claims.is_anonymous || typeof claims.session_id !== "string") return null;
  const now = Date.now() / 1000;
  const recovered = claims.amr?.some((entry) => typeof entry !== "string" &&
    entry.method === "recovery" && entry.timestamp >= now - 900 && entry.timestamp <= now + 30);
  return recovered ? claims.session_id : null;
}
