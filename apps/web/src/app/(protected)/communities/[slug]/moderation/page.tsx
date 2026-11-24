import { notFound } from "next/navigation";
import { FeedModeration } from "@/components/feed-moderation";

export default async function DepartmentModerationPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ target?: string; scope?: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 40) notFound();
  const { target, scope } = await searchParams;
  return <FeedModeration key={slug} community={slug} initialTarget={target === "comments" ? "comments" : "posts"}
    initialScope={scope === "hidden" ? "hidden" : "reports"} />;
}
