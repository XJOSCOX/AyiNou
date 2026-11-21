import { notFound } from "next/navigation";
import { LegalCenter } from "./legal-center";
import { LegalPageFrame } from "./legal-page-frame";
import { publishedRegistry } from "@/lib/legal/publication";
import { legalAvailability } from "@/lib/legal/availability";
import type { PolicyId } from "@/lib/legal/paths";

export async function LegalPolicyPage({ policyId, searchParams }: { policyId: PolicyId; searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  const availability = await legalAvailability();
  const allowed = availability.enabled ? availability.policies.find((item) => item.policyId === policyId) : undefined;
  const release = allowed && (!version || version === allowed.version) ? publishedRegistry.version(policyId, allowed.version) : undefined;
  if (version && !release) notFound();
  return <LegalPageFrame><LegalCenter policyId={policyId} release={release}
    versions={release ? [{ version: release.version, effectiveDate: release.effectiveDate }] : []} /></LegalPageFrame>;
}
