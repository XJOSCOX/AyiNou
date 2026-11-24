import { RestrictedSession } from "@/components/restricted-session";
import { serverSupabase } from "@/lib/supabase/server";

export default async function AccountAccessPage() {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.is_anonymous ? undefined : data?.claims.sub;
  return <RestrictedSession key={subject} signedIn={Boolean(subject)} />;
}
