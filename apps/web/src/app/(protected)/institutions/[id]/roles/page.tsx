import { notFound } from "next/navigation";
import { OrganizationRolesScreen } from "@/components/organization-roles";

export default async function OrganizationRolesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <OrganizationRolesScreen key={id} id={id} />;
}
