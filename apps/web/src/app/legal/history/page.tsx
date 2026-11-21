import { LegalCenter } from "@/components/legal-center";
import { LegalPageFrame } from "@/components/legal-page-frame";
import { publishedRegistry } from "@/lib/legal/publication";
import { policyPaths, type PolicyId } from "@/lib/legal/paths";
export const metadata = { robots: { index: false, follow: false } };
export default function Page() {
  const versions = (Object.keys(policyPaths) as PolicyId[]).flatMap((id) => publishedRegistry.history(id).map(({ version, effectiveDate }) => ({ policyId: id, version, effectiveDate })));
  return <LegalPageFrame><LegalCenter history versions={versions} /></LegalPageFrame>;
}
