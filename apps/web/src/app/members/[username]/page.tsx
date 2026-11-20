import type { FollowStatus, ProfilePreview } from "@ayinou/shared";
import { notFound } from "next/navigation";
import { MemberPublic } from "@/components/member-public";
import { ApiRequestError, requestJson } from "@/lib/api-errors";
import { serverSupabase } from "@/lib/supabase/server";

function publicMemberData<T>(url: string): Promise<T> {
  return requestJson(url).catch((cause: unknown) => {
    if (cause instanceof ApiRequestError && cause.status === 404) notFound();
    throw cause;
  });
}

export default async function PublicMemberPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) notFound();
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const social = await publicMemberData<FollowStatus>(`${api}/api/v1/members/${username}/follow`);
  const client = await serverSupabase();
  const [{ profile }, { data: identity }] = await Promise.all([
    publicMemberData<{ profile: ProfilePreview }>(`${api}/api/v1/profiles/${username}`),
    client.auth.getClaims(),
  ]);
  return <MemberPublic profile={profile} username={username} social={social}
    signedIn={!!identity?.claims.sub && identity.claims.is_anonymous !== true} />;
}
