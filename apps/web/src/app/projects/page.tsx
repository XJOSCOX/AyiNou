import { ProjectsDirectory } from "@/components/projects";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ProjectsPage() {
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  return <ProjectsDirectory signedIn={!!data.user && !data.user.is_anonymous} />;
}
