import { notFound } from "next/navigation";
import type { PlatformAccess, PrivateFlow } from "@ayinou/shared";
import { workflowRequest } from "@/lib/privileged-setup-server";
import { serverSupabase } from "@/lib/supabase/server";
import { WorkspaceEntry } from "./workspace-entry";

export async function PrivateWorkspaceEntry({ kind, verify }: {
  kind: Extract<PrivateFlow["kind"], "admin_workspace" | "verification_workspace">;
  verify: boolean;
}) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  const sessionId = data?.claims.session_id;
  if (!subject || typeof sessionId !== "string" || data?.claims.is_anonymous) notFound();

  const access = await workflowRequest<PlatformAccess>("/api/v1/me/platform-access", undefined, true);
  if (!access || !(kind === "admin_workspace" ? access.administrator : access.reviewer)) notFound();
  const user = access.totp ? await supabase.auth.getUser() : null;
  const factorIds = user?.data.user?.id === subject
    ? (user.data.user.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
      .map((factor) => factor.id)
    : [];
  return <WorkspaceEntry key={sessionId + kind + verify} subject={subject} sessionId={sessionId} kind={kind}
    totp={access.totp} factorIds={factorIds} verify={verify} />;
}
