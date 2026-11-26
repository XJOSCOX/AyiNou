import type { Institution } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { InstitutionPublic } from "@/components/institution-public";
import { serverSupabase } from "@/lib/supabase/server";
import { ApiRequestError, requestJson } from "@/lib/api-errors";

export default async function PublicInstitutionPage({ params, searchParams }: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ section?: string | string[]; opportunity?: string | string[] }>;
}) {
  const [{ handle }, { section, opportunity }] = await Promise.all([params, searchParams]);
  const activeSection = section === "posts" || section === "opportunities" || section === "membership" ? section : "overview";
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const { organization }: { organization: Institution } = await requestJson(`${api}/api/v1/institutions/by-handle/${handle}`)
    .catch((cause: unknown) => {
      if (cause instanceof ApiRequestError && cause.status === 404) notFound();
      throw cause;
    });
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  const selected = typeof opportunity === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(opportunity) ? opportunity : undefined;
  return <InstitutionPublic organization={organization} activeSection={activeSection} opportunity={selected} signedIn={!!data?.claims.sub && data.claims.is_anonymous !== true} />;
}
