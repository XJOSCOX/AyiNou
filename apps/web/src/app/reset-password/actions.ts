"use server";

import { validNewPassword } from "@/lib/password-policy";
import { readRecoverySession } from "@/lib/supabase/recovery";

export async function completePasswordRecovery(password: string, confirmation: string, expectedSession: string) {
  if (typeof password !== "string" || !validNewPassword(password)) return "invalidPassword";
  if (password !== confirmation) return "mismatch";
  const recovery = await readRecoverySession();
  if (!recovery || recovery.sessionId !== expectedSession) return "sessionNeeded";
  if (recovery.needsMfa) return "mfa";
  const { error } = await recovery.supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return "samePassword";
    if (error.code === "weak_password") return "invalidPassword";
    if (error.status === 429) return "rateLimited";
    if (error.status === 401 || error.code === "session_not_found") return "sessionNeeded";
    return "serviceError";
  }
  // Supabase invalidates the other sessions on password change. Clear the recovery session as well.
  const signOut = await recovery.supabase.auth.signOut({ scope: "local" });
  return signOut.error ? "signOutPending" : "done";
}
