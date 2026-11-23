import { adminTab } from "@/lib/admin-navigation";
import { PrivateWorkspaceEntry } from "@/components/private-workspace-entry";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ verify?: string; section?: string }> }) {
  const { verify, section } = await searchParams;
  return <PrivateWorkspaceEntry kind="admin_workspace" verify={verify === "1"} section={adminTab(section)} />;
}
