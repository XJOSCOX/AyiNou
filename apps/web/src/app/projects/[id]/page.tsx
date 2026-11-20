import { notFound } from "next/navigation";
import { ProjectDetailScreen } from "@/components/projects";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  return <ProjectDetailScreen key={id} id={id} signedIn={!!data.user && !data.user.is_anonymous} />;
}
