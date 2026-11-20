import { notFound } from "next/navigation";
import { DepartmentSpace } from "@/components/department-communities";

export default async function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 40) notFound();
  return <DepartmentSpace key={slug} slug={slug} />;
}
