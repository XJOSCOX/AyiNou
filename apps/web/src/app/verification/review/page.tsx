import { PrivateWorkspaceEntry } from "@/components/private-workspace-entry";

export default async function VerificationReviewPage({ searchParams }: { searchParams: Promise<{ verify?: string }> }) {
  return <PrivateWorkspaceEntry kind="verification_workspace" verify={(await searchParams).verify === "1"} />;
}
