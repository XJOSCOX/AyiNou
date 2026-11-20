import { PublicGroupRoom } from "@/components/groups";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicGroupRoom key={slug} slug={slug} />;
}
