import { AuthScreen } from "@/components/auth-screen";
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  return <AuthScreen mode="register" initialReferral={typeof ref === "string" ? ref.slice(0, 64) : ""} />;
}
