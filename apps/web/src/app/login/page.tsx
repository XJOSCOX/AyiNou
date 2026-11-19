import { AuthScreen } from "@/components/auth-screen";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; claim?: string; join?: string }> }) {
  const { error, claim, join } = await searchParams;
  const handle = (value: unknown) => typeof value === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(value) ? value : undefined;
  return <AuthScreen mode="login" invalidLink={error === "verification"}
    claimHandle={handle(claim)} joinHandle={handle(join)} />;
}
