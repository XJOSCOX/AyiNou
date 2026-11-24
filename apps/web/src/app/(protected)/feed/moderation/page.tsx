import { FeedModeration } from "@/components/feed-moderation";

export default async function FeedModerationPage({ searchParams }: { searchParams: Promise<{ target?: string; scope?: string }> }) {
  const { target, scope } = await searchParams;
  return <FeedModeration initialTarget={target === "comments" ? "comments" : "posts"} initialScope={scope === "hidden" ? "hidden" : "reports"} />;
}
