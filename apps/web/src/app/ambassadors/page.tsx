import { AmbassadorDirectory } from "@/components/ambassador-public";
import { serverSupabase } from "@/lib/supabase/server";

export default async function AmbassadorDirectoryPage() {
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  return <AmbassadorDirectory signedIn={!!data?.claims.sub && data.claims.is_anonymous !== true} />;
}
