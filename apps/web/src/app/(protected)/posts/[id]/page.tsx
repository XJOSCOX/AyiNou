import { PostDetail } from "@/components/post-detail";

export default async function PostPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comment?: string | string[] }>;
}) {
  const [{ id }, { comment }] = await Promise.all([params, searchParams]);
  return <PostDetail key={`${id}:${comment}`} id={id} comment={typeof comment === "string" ? comment : undefined} />;
}
