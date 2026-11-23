import { PrivateWorkspaceEntry } from "@/components/private-workspace-entry";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ verify?: string }> }) {
  return <PrivateWorkspaceEntry kind="admin_workspace" verify={(await searchParams).verify === "1"} />;
}
