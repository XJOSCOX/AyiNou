import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { readRecoverySession } from "@/lib/supabase/recovery";

export default async function ResetPasswordPage() {
  const recovery = await readRecoverySession();
  if (!recovery) redirect("/forgot-password?error=verification");
  if (recovery.needsMfa) redirect("/mfa?next=/reset-password");
  return <AuthScreen mode="reset" recoverySession={recovery.sessionId} />;
}
