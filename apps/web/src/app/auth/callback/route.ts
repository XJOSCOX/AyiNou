import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next === "/reset-password" ? next : "/onboarding";
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:4000";
  const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!code || !authUrl || !key) return NextResponse.redirect(new URL("/login?error=verification", webOrigin));

  const response = NextResponse.redirect(new URL(safeNext, webOrigin), {
    headers: { "Cache-Control": "no-store" },
  });
  const supabase = createServerClient(authUrl, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=verification", webOrigin));
  return response;
}
