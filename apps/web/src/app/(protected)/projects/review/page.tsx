import { redirect } from "next/navigation";
import { ProjectReviewScreen } from "@/components/project-review";
import { serverSupabase } from "@/lib/supabase/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ verify?: string }> }) {
  if ((await searchParams).verify !== "1") return <ProjectReviewScreen />;

  const supabase = await serverSupabase();
  const [{ data: claims }, { data: user }] = await Promise.all([supabase.auth.getClaims(), supabase.auth.getUser()]);
  const subject = claims?.claims.sub;
  const sessionId = claims?.claims.session_id;
  if (!subject || typeof sessionId !== "string" || claims?.claims.is_anonymous || user.user?.id !== subject) redirect("/login");
  const factorIds = (user.user.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
    .map((factor) => factor.id);
  if (!factorIds.length) redirect("/settings");

  return <ProjectReviewScreen challenge={{ subject, sessionId, factorIds }} />;
}
