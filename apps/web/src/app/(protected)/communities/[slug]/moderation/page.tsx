import { notFound } from "next/navigation";
import { FeedModeration } from "@/components/feed-moderation";

export default async function DepartmentModerationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 40) notFound();
  return <FeedModeration key={slug} community={slug} />;
}
