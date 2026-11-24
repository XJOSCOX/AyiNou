import type { CommunityEvent } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/event-detail";
import { ApiRequestError, requestJson } from "@/lib/api-errors";
import { serverSupabase } from "@/lib/supabase/server";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const client = await serverSupabase();
  const { data } = await client.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub && data.claims.is_anonymous !== true);
  const token = signedIn ? (await client.auth.getSession()).data.session?.access_token : undefined;
  if (signedIn && !token) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const { event }: { event: CommunityEvent } = await requestJson(api + "/api/v1/events/" + id, {
    headers: token ? { Authorization: "Bearer " + token } : undefined,
  }).catch((error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  });
  return <EventDetail initial={event} signedIn={signedIn} />;
}
