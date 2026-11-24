import { recoverySessionId } from "../recovery-claims";
import { serverSupabase } from "./server";

export async function readRecoverySession() {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const sessionId = recoverySessionId(claims);
  if (!sessionId) return null;
  const [{ data: user }, { data: live }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("account_session_active"),
  ]);
  const securityOnly = live !== true && (await supabase.rpc("m22_recovery_session_active")).data === true;
  if ((!live && !securityOnly) || !user.user || user.user.id !== claims?.sub) return null;
  const needsMfa = claims.aal !== "aal2" && !!user.user.factors?.some((factor) => factor.status === "verified");
  return { supabase, sessionId, needsMfa };
}
