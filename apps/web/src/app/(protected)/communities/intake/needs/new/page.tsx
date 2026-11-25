import { CommunityNeeds } from "@/components/community-needs";

export default async function NewNeedPage({ searchParams }: { searchParams: Promise<{ community?: string | string[] }> }) {
  const { community } = await searchParams;
  return <CommunityNeeds creating initialCommunity={typeof community === "string" ? community : undefined} />;
}
