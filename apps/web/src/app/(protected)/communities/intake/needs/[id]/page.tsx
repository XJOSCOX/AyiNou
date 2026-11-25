import { CommunityNeeds } from "@/components/community-needs";

export default async function NeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommunityNeeds id={id} />;
}
