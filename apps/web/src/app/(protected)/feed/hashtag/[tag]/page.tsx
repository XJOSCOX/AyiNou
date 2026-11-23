import { notFound } from "next/navigation";
import { SocialFeed } from "@/components/social-feed";

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const tag = (await params).tag.normalize("NFC").toLowerCase();
  if (!/^[\p{L}\p{N}_]{1,48}$/u.test(tag)) notFound();
  return <SocialFeed scope="hashtag" tag={tag} />;
}
