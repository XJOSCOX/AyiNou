import { MentorshipWorkspaceDetail } from "@/features/opportunities/mentorship-workspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MentorshipWorkspaceDetail id={(await params).id} />;
}
