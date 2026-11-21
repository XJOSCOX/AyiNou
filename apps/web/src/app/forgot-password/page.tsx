import { AuthScreen } from "@/components/auth-screen";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthScreen mode="forgot" invalidLink={error === "verification"} />;
}
