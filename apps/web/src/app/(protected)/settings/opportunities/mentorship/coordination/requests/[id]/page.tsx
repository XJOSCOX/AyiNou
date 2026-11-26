import { MentorshipRequestDetail } from "@/features/opportunities/mentorship-coordination";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MentorshipRequestDetail id={(await params).id} />;
}
