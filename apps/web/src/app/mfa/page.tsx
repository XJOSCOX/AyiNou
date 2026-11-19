import { redirect } from "next/navigation";
import { MfaChallenge } from "@/components/mfa-challenge";
import { serverSupabase } from "@/lib/supabase/server";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string; claim?: string }> }) {
  const search = await searchParams;
  const claim = typeof search.claim === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(search.claim) ? search.claim : null;
  const next = search.next === "/reset-password" ? "/reset-password" : claim ? `/verification?claim=${claim}` : "/dashboard";
  const supabase = await serverSupabase();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims.sub || claims.data.claims.is_anonymous === true) redirect("/login");
  if (claims.data.claims.aal === "aal2") redirect(next);
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) redirect("/login");
  const factors = user.data.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  if (!factors.length) redirect(next);
  return <MfaChallenge factorIds={factors.filter((factor) => factor.factor_type === "totp").map((factor) => factor.id)} next={next} />;
}
