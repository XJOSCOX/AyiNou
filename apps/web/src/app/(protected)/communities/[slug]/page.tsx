import { notFound } from "next/navigation";
import { DepartmentSpace } from "@/components/department-communities";

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ need?: string | string[] }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 40) notFound();
  const { need } = await searchParams;
  const initialNeed = typeof need === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(need) ? need : undefined;
  return <DepartmentSpace key={slug + (initialNeed ?? "")} slug={slug} initialNeed={initialNeed} />;
}
