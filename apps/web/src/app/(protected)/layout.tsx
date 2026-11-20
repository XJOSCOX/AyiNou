import { redirect } from "next/navigation";
import { MemberDisplayNameProvider } from "@/lib/member-display-name";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub || data.claims.is_anonymous === true) redirect("/login");
  // These reads share the verified session. Render the member shell only after the access checks pass.
  const [active, user, { data: profile }] = await Promise.all([
    supabase.rpc("account_session_active"),
    data.claims.aal === "aal2" ? null : supabase.auth.getUser(),
    supabase.from("profiles").select("display_name").eq("user_id", data.claims.sub).maybeSingle(),
  ]);
  if (active.error || active.data !== true) redirect("/account-access");
  if (user) {
    if (user.error || !user.data.user) redirect("/login");
    if (user.data.user.factors?.some((factor) => factor.status === "verified")) redirect("/mfa");
  }
  return <MemberDisplayNameProvider key={data.claims.sub} memberId={data.claims.sub} name={profile?.display_name ?? null}>
    {children}
  </MemberDisplayNameProvider>;
}
