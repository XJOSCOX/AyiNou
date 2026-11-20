import type { FollowStatus, ProfilePreview, PublicAmbassador } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { MemberPublic } from "@/components/member-public";
import { ApiRequestError, requestJson } from "@/lib/api-errors";
import { serverSupabase } from "@/lib/supabase/server";

function publicMemberData<T>(url: string, headers?: HeadersInit): Promise<T> {
  return requestJson(url, { headers }).catch((cause: unknown) => {
    if (cause instanceof ApiRequestError && cause.status === 404) notFound();
    throw cause;
  });
}

export default async function PublicMemberPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const client = await serverSupabase();
  const { data: identity } = await client.auth.getClaims();
  const signedIn = !!identity?.claims.sub && identity.claims.is_anonymous !== true;
  const token = signedIn ? (await client.auth.getSession()).data.session?.access_token : undefined;
  if (signedIn && !token) notFound();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const [{ profile }, social, { ambassador }] = await Promise.all([
    publicMemberData<{ profile: ProfilePreview }>(`${api}/api/v1/profiles/${username}`, headers),
    publicMemberData<FollowStatus>(`${api}/api/v1/members/${username}/follow`, headers),
    (requestJson(`${api}/api/v1/members/${username}/ambassador`, { headers, signal: AbortSignal.timeout(2500) }) as
      Promise<{ ambassador: Pick<PublicAmbassador, "category" | "statement"> | null }>).catch(() => ({ ambassador: null })),
  ]);
  return <MemberPublic profile={profile} username={username} social={social} ambassador={ambassador}
    signedIn={signedIn} />;
}
