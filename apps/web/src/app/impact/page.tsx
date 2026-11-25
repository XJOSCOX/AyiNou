import { impactSectors, impactDepartments } from "@ayinou/shared";
import { ImpactDashboard } from "@/features/impact/dashboard";
import { serverSupabase } from "@/lib/supabase/server";

export default async function ImpactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await serverSupabase();
  const [{ data }, query] = await Promise.all([client.auth.getUser(), searchParams]);
  const selection: Record<string, string> = {};
  if (typeof query.year === "string" && /^(20[2-9][0-9]|2100)$/.test(query.year)) selection.year = query.year;
  if (typeof query.sector === "string" && impactSectors.some((sector) => sector === query.sector)) selection.sector = query.sector;
  if (typeof query.department === "string" && (query.department === "national" ||
      impactDepartments.some((department) => department === query.department))) selection.department = query.department;
  return <ImpactDashboard signedIn={!!data.user && !data.user.is_anonymous} selection={selection} />;
}
