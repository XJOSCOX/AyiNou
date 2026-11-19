import { createClient, type Factor } from "@supabase/supabase-js";
import { browserSupabase } from "./supabase/browser";

export async function updateOwnPassword(currentPassword: string, password: string) {
  const client = browserSupabase();
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user?.email || !user.email_confirmed_at) throw new Error("REAUTHENTICATION");
  // Recheck the current password in an isolated session. Keep the user's
  // current MFA-elevated session for the actual password update.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storageKey: "ayinou-password-proof",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const proof = await check.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (proof.error || proof.data.user?.id !== user.id || !proof.data.session) throw new Error("PASSWORD_FAILED");
  try {
    const { data: active, error: claimsError } = await client.auth.getClaims();
    const hasVerifiedFactor = user.factors?.some((factor: Factor) => factor.status === "verified");
    if (claimsError || active?.claims.sub !== user.id || (hasVerifiedFactor && active?.claims.aal !== "aal2")) {
      throw new Error("REAUTHENTICATION");
    }
    const changed = await client.auth.updateUser({ password, current_password: currentPassword });
    if (changed.error?.code === "reauthentication_needed") throw new Error("REAUTHENTICATION");
    if (changed.error) throw new Error("PASSWORD_FAILED");
  } finally {
    await check.auth.signOut({ scope: "local" });
  }
}
