import { PublicGroups } from "@/components/groups";

import { serverSupabase } from "@/lib/supabase/server";

export default async function Page() {
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub && data.claims.is_anonymous !== true);
  return <PublicGroups signedIn={signedIn} />;
}
