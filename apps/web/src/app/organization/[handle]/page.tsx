import type { Institution } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { InstitutionPublic } from "@/components/institution-public";
import { serverSupabase } from "@/lib/supabase/server";

export default async function PublicInstitutionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${api}/api/v1/institutions/by-handle/${handle}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Institution service unavailable");
  const { organization }: { organization: Institution } = await response.json();
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  return <InstitutionPublic organization={organization} signedIn={!!data?.claims.sub && data.claims.is_anonymous !== true} />;
}
