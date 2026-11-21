import { notFound } from "next/navigation";
import { LegalCenter } from "./legal-center";
import { LegalPageFrame } from "./legal-page-frame";
import { publishedRegistry } from "@/lib/legal/publication";
import type { PolicyId } from "@/lib/legal/paths";

export async function LegalPolicyPage({ policyId, searchParams }: { policyId: PolicyId; searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  const release = version ? publishedRegistry.version(policyId, version) : publishedRegistry.current(policyId);
  if (version && !release) notFound();
  return <LegalPageFrame><LegalCenter policyId={policyId} release={release} versions={publishedRegistry.history(policyId).map(({ version, effectiveDate }) => ({ version, effectiveDate }))} /></LegalPageFrame>;
}
