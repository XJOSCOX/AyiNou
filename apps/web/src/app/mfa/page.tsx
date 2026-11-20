import { redirect } from "next/navigation";
import { MfaChallenge } from "@/components/mfa-challenge";
import { serverSupabase } from "@/lib/supabase/server";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string; claim?: string; join?: string }> }) {
  const search = await searchParams;
  const claim = typeof search.claim === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(search.claim) ? search.claim : null;
  const join = typeof search.join === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(search.join) ? search.join : null;
  const requested = typeof search.next === "string" ? search.next : "";
  const privileged = requested === "/admin" || requested === "/verification/review" || requested === "/feed/moderation"
    || requested === "/projects/review"
    || requested === "/settings/privacy-requests"
    || requested === "/polls/new"
    || /^\/polls\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requested)
    || /^\/projects\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/work$/i.test(requested)
    || /^\/institutions\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/roles$/i.test(requested)
    || (requested.length <= 65 && /^\/communities\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/moderation)?$/.test(requested));
  const next = privileged || requested === "/reset-password" ? requested : claim ? `/verification?claim=${claim}`
    : join ? `/organization/${join}` : "/dashboard";
  const supabase = await serverSupabase();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims.sub || claims.data.claims.is_anonymous === true) redirect("/login");
  if (claims.data.claims.aal === "aal2" && !privileged) redirect(next);
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) redirect("/login");
  const factors = user.data.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  if (privileged && !factors.some((factor) => factor.factor_type === "totp")) redirect("/settings");
  if (!factors.length) redirect(next);
  return <MfaChallenge factorIds={factors.filter((factor) => factor.factor_type === "totp").map((factor) => factor.id)} next={next} />;
}
