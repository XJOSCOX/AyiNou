import { LegalCenter } from "@/components/legal-center";
import { LegalPageFrame } from "@/components/legal-page-frame";
import { legalAvailability } from "@/lib/legal/availability";
import { publishedRegistry } from "@/lib/legal/publication";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  const availability = await legalAvailability();
  const available = availability.enabled ? availability.policies.flatMap(({ policyId, version }) => {
    const release = publishedRegistry.version(policyId, version);
    return release ? [{ policyId, version, effectiveDate: release.effectiveDate }] : [];
  }) : [];
  return <LegalPageFrame><LegalCenter available={available} /></LegalPageFrame>;
}
