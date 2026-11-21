import { redirect } from "next/navigation";
import { OrganizationIntentScreen } from "@/components/organization-intent-screen";
import { serverSupabase } from "@/lib/supabase/server";

export default async function OrganizationOnboardingPage({ searchParams }: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const { claim } = await searchParams;
  const target = typeof claim === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(claim) ? claim : "";
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (error || !subject) redirect("/login");
  const { data: profile } = await supabase.from("member_private").select("onboarding_step")
    .eq("user_id", subject).maybeSingle();
  return <OrganizationIntentScreen key={subject} subject={subject} claim={target} profileComplete={profile?.onboarding_step === 4} />;
}
