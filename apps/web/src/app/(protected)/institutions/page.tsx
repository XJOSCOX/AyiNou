import { InstitutionHub } from "@/components/institution-hub";

export default async function InstitutionsPage({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  return <InstitutionHub following={view === "following"} />;
}
