import { eventScopes } from "@ayinou/shared";
import { MemberShell } from "@/components/member-shell";
import { EventDirectory } from "@/components/events";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ scope?: string | string[] }> }) {
  const { scope } = await searchParams;
  const currentScope = eventScopes.find((option) => option === scope) ?? "upcoming";
  return <MemberShell><EventDirectory scope={currentScope} /></MemberShell>;
}
