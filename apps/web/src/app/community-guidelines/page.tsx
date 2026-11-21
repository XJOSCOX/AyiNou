import { LegalPolicyPage } from "@/components/legal-policy-page";
export const metadata = { robots: { index: false, follow: false } };
export default function Page({ searchParams }: { searchParams: Promise<{ version?: string }> }) { return <LegalPolicyPage policyId="community-guidelines" searchParams={searchParams} />; }
