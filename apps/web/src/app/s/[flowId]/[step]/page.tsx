import { notFound } from "next/navigation";
import type { PrivateFlow } from "@ayinou/shared";
import { PrivateWorkflowScreen } from "@/components/private-workflow-screen";
import { workflowId, workflowRequest } from "@/lib/privileged-setup-server";
import { workflowsEndpoint } from "@/lib/session-security";
import { serverSupabase } from "@/lib/supabase/server";

export default async function PrivateWorkflowPage({ params }: { params: Promise<{ flowId: string; step: string }> }) {
  const { flowId, step } = await params;
  if (!workflowId.test(flowId) || (step !== "resume" && step !== "confirm")) notFound();
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (!subject || data?.claims.is_anonymous) notFound();
  const flow = await workflowRequest<PrivateFlow>(workflowsEndpoint + "/" + flowId + "/" + step, undefined, true);
  if (!flow) notFound();
  return <PrivateWorkflowScreen key={subject + flow.id} subject={subject} flow={flow} />;
}
