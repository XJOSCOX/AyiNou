import type { Institution } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { InstitutionPublic } from "@/components/institution-public";
import { serverSupabase } from "@/lib/supabase/server";
import { ApiRequestError, requestJson } from "@/lib/api-errors";

export default async function PublicInstitutionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const { organization }: { organization: Institution } = await requestJson(`${api}/api/v1/institutions/by-handle/${handle}`)
    .catch((cause: unknown) => {
      if (cause instanceof ApiRequestError && cause.status === 404) notFound();
      throw cause;
    });
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  return <InstitutionPublic organization={organization} signedIn={!!data?.claims.sub && data.claims.is_anonymous !== true} />;
}
