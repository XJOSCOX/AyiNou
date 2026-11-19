import { AuthScreen } from "@/components/auth-screen";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthScreen mode="login" invalidLink={(await searchParams).error === "verification"} />;
}
