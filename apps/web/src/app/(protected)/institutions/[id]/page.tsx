import { notFound } from "next/navigation";
import { InstitutionManagementScreen } from "@/components/institution-management";

export default async function InstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <InstitutionManagementScreen key={id} id={id} />;
}
