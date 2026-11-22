import { notFound } from "next/navigation";
import type { PlatformAccess, PrivateFlow } from "@ayinou/shared";
import { workflowRequest } from "@/lib/privileged-setup-server";
import { serverSupabase } from "@/lib/supabase/server";
import { WorkspaceEntry } from "./workspace-entry";

export async function PrivateWorkspaceEntry({ kind }: { kind: Extract<PrivateFlow["kind"], "admin_workspace" | "verification_workspace"> }) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (!subject || data?.claims.is_anonymous) notFound();

  const access = await workflowRequest<PlatformAccess>("/api/v1/me/platform-access", undefined, true);
  if (!access || !(kind === "admin_workspace" ? access.administrator : access.reviewer)) notFound();
  return <WorkspaceEntry key={subject + kind} subject={subject} access={access} kind={kind} />;
}
