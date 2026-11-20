import { PollDirectory } from "@/components/polls";
import type { PollContext } from "@/lib/poll-api";

export default async function PollsPage({ searchParams }: { searchParams: Promise<{ scope?: string; scopeId?: string }> }) {
  const { scope, scopeId } = await searchParams;
  const context: PollContext | null = (scope === "community" || scope === "organization" || scope === "project") && typeof scopeId === "string"
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(scopeId) ? { scope, scopeId } : null;
  return <PollDirectory context={context} />;
}
