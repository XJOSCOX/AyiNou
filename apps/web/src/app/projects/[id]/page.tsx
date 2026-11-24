import { notFound } from "next/navigation";
import { ProjectDetailScreen } from "@/components/projects";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }>;
}) {
  const [{ id }, { preview }] = await Promise.all([params, searchParams]);
  const reviewPreview = preview === "review";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  return <ProjectDetailScreen key={reviewPreview ? `${id}:review` : id} id={id}
    signedIn={!!data.user && !data.user.is_anonymous} reviewPreview={reviewPreview} />;
}
