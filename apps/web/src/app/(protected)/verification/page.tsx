import { verificationKinds } from "@ayinou/shared";
import { VerificationScreen } from "@/components/verification-screen";

export default async function VerificationPage({ searchParams }: {
  searchParams: Promise<{ kind?: string; institution?: string; claim?: string }>;
}) {
  const query = await searchParams;
  const claim = typeof query.claim === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(query.claim) ? query.claim : "";
  const institution = typeof query.institution === "string" ? query.institution.slice(0, 36) : "";
  const kind = verificationKinds.find((item) => item === query.kind);
  const initialKind = claim ? "claim" : kind ?? "identity";
  return <VerificationScreen key={`${initialKind}:${institution}:${claim}`} initialKind={initialKind} institution={institution} claim={claim} />;
}
