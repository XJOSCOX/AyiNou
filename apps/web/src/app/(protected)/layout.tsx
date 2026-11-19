import { redirect } from "next/navigation";
import { MemberDisplayNameProvider } from "@/lib/member-display-name";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub || data.claims.is_anonymous === true) redirect("/login");
  const active = await supabase.rpc("account_session_active");
  if (active.error || active.data !== true) redirect("/account-access");
  if (data.claims.aal !== "aal2") {
    const user = await supabase.auth.getUser();
    if (user.error || !user.data.user) redirect("/login");
    if (user.data.user.factors?.some((factor) => factor.status === "verified")) redirect("/mfa");
  }
  const { data: profile } = await supabase.from("profiles")
    .select("display_name").eq("user_id", data.claims.sub).maybeSingle();
  return <MemberDisplayNameProvider key={data.claims.sub} name={profile?.display_name ?? null}>{children}</MemberDisplayNameProvider>;
}
