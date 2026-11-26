import { notFound } from "next/navigation";
import { OpportunityWorkspace } from "@/features/opportunities/workspace";

export default async function OrganizationOpportunitiesPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <OpportunityWorkspace id={id} />;
}
