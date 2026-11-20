import { ProjectWorkScreen } from "@/components/project-work";
import { notFound } from "next/navigation";

export default async function ProjectWorkPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { section } = await searchParams;
  return <ProjectWorkScreen projectId={id} initialSection={section} />;
}
