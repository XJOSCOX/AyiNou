import { redirect } from "next/navigation";
import { OutcomePublicationWorkspace } from "@/features/projects/outcome-publication/publication-workspace";
import { serverSupabase } from "@/lib/supabase/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ verify?: string; lane?: string }> }) {
  const { verify, lane } = await searchParams;
  const requestedLane = lane === "admin" ? "admin" : "review";
  if (verify !== "1") return <OutcomePublicationWorkspace requestedLane={requestedLane} />;
  const supabase = await serverSupabase();
  const [{ data: claims }, { data: user }] = await Promise.all([supabase.auth.getClaims(), supabase.auth.getUser()]);
  const subject = claims?.claims.sub;
  const sessionId = claims?.claims.session_id;
  if (!subject || typeof sessionId !== "string" || claims?.claims.is_anonymous || user.user?.id !== subject) redirect("/login");
  const factorIds = (user.user.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
    .map((factor) => factor.id);
  if (!factorIds.length) redirect("/settings");
  return <OutcomePublicationWorkspace requestedLane={requestedLane} challenge={{ subject, sessionId, factorIds }} />;
}
