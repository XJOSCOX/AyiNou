import { notFound } from "next/navigation";
import { RecruitmentInvitationScreen } from "@/features/volunteering/recruitment";

export default async function RecruitmentInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  return <RecruitmentInvitationScreen id={id} />;
}
