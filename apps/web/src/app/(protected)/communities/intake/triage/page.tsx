import { PrivateWorkspaceEntry } from "@/components/private-workspace-entry";

export default function CommunityNeedsTriagePage() {
  return <PrivateWorkspaceEntry kind="moderation_workspace" verify={false} section="communityNeeds" />;
}
