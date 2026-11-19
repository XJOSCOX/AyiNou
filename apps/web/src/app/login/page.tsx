import { AuthScreen } from "@/components/auth-screen";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; claim?: string }> }) {
  const { error, claim } = await searchParams;
  return <AuthScreen mode="login" invalidLink={error === "verification"}
    claimHandle={typeof claim === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(claim) ? claim : undefined} />;
}
