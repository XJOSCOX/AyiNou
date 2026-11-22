import { AccountSettings } from "@/components/account-settings";
import { serverSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AccountSettingsPage() {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (!subject || data?.claims.is_anonymous) redirect("/login");
  return <AccountSettings key={subject} subject={subject} />;
}
