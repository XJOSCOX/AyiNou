import { notFound } from "next/navigation";
import type { PlatformAccess } from "@ayinou/shared";
import { AdminEntry } from "@/components/admin-entry";
import { workflowRequest } from "@/lib/privileged-setup-server";
import { serverSupabase } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await serverSupabase();
  const claims = await supabase.auth.getClaims();
  const subject = claims.data?.claims.sub;
  const access = subject && !claims.data?.claims.is_anonymous
    ? await workflowRequest<PlatformAccess>("/api/v1/me/platform-access", undefined, true)
    : null;
  if (!subject || !access?.administrator) notFound();
  return <AdminEntry key={subject} subject={subject} access={access} />;
}
