import { notFound } from "next/navigation";
import { LegalPolicyPage } from "@/components/legal-policy-page";
import { isPolicyId } from "@/lib/legal/paths";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }: { params: Promise<{ policy: string }>; searchParams: Promise<{ version?: string }> }) {
  const { policy } = await params;
  if (!isPolicyId(policy) || ["terms", "privacy", "community-guidelines"].includes(policy)) notFound();
  return <LegalPolicyPage policyId={policy} searchParams={searchParams} />;
}
