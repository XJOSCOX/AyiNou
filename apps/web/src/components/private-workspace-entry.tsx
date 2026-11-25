import { notFound } from "next/navigation";
import type { PlatformAccess, PrivateFlow } from "@ayinou/shared";
import type { AdminTab } from "@/lib/admin-navigation";
import { workflowRequest } from "@/lib/privileged-setup-server";
import { serverSupabase } from "@/lib/supabase/server";
import { WorkspaceEntry } from "./workspace-entry";

export async function PrivateWorkspaceEntry({ kind, verify, section = "overview" }: {
  kind: Extract<PrivateFlow["kind"], "admin_workspace" | "verification_workspace" | "moderation_workspace">;
  verify: boolean;
  section?: AdminTab;
}) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  const sessionId = data?.claims.session_id;
  if (!subject || typeof sessionId !== "string" || data?.claims.is_anonymous) notFound();

  const access = await workflowRequest<PlatformAccess>("/api/v1/me/platform-access", undefined, true);
  if (!access) notFound();
  const features = kind === "admin_workspace" && section === "featureRestrictions" && !access.administrator
    ? await workflowRequest<{ allowed: boolean }>("/api/v1/moderation/feature-enforcement/access", undefined, true) : null;
  const triage = kind === "moderation_workspace"
    ? await workflowRequest<{ allowed: boolean }>("/api/v1/private/community-needs-review/triage-access", undefined, true) : null;
  if (!(kind === "admin_workspace" ? access.administrator || features?.allowed
    : kind === "moderation_workspace" ? triage?.allowed : access.reviewer)) notFound();
  const entryKind = features?.allowed ? "moderation_workspace" : kind;
  const user = access.totp ? await supabase.auth.getUser() : null;
  const factorIds = user?.data.user?.id === subject
    ? (user.data.user.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
      .map((factor) => factor.id)
    : [];
  return <WorkspaceEntry key={sessionId + entryKind + verify + section} subject={subject} sessionId={sessionId} kind={entryKind}
    totp={access.totp} factorIds={factorIds} verify={verify} section={section} />;
}
