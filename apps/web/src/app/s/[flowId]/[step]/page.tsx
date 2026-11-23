import { notFound } from "next/navigation";
import type { PrivateFlow } from "@ayinou/shared";
import { adminTab } from "@/lib/admin-navigation";
import { SessionWorkspace } from "@/components/session-workspace";
import { PrivateWorkflowScreen } from "@/components/private-workflow-screen";
import { workflowId, workflowRequest } from "@/lib/privileged-setup-server";
import { workflowsEndpoint } from "@/lib/session-security";
import { serverSupabase } from "@/lib/supabase/server";

export default async function PrivateWorkflowPage({ params, searchParams }: {
  params: Promise<{ flowId: string; step: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { flowId, step } = await params;
  if (!workflowId.test(flowId) || (step !== "resume" && step !== "confirm" && step !== "admin" && step !== "review")) notFound();
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (!subject || data?.claims.is_anonymous) notFound();
  const flow = await workflowRequest<PrivateFlow>(workflowsEndpoint + "/" + flowId + "/" + step, undefined, true);
  if (!flow) notFound();
  if (flow.kind === "admin_workspace" || flow.kind === "verification_workspace") {
    const section = adminTab(flow.kind === "admin_workspace" ? (await searchParams).section : undefined);
    return <SessionWorkspace key={subject + flow.id + section} subject={subject} flow={flow} initialSection={section} />;
  }
  return <PrivateWorkflowScreen key={subject + flow.id} subject={subject} flow={flow} />;
}
