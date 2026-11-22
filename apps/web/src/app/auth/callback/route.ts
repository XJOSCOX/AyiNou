import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { recoverySessionId } from "@/lib/recovery-claims";
import { rememberedSessionCookie, sessionCookieOptions } from "@/lib/supabase/session-cookies";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const founder = next && /^\/setup\/f\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(next);
  const safeNext = next === "/reset-password" || founder ? next! : "/onboarding";
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:4000";
  const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const failed = next === "/reset-password" ? "/forgot-password?error=verification" : "/login?error=verification";
  if (!code || !authUrl || !key) return NextResponse.redirect(new URL(failed, webOrigin), {
    headers: { "Cache-Control": "no-store" },
  });

  const response = NextResponse.redirect(new URL(safeNext, webOrigin), {
    headers: { "Cache-Control": "no-store" },
  });
  const supabase = createServerClient(authUrl, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options)));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    response.headers.set("Location", new URL(failed, webOrigin).href);
    return response;
  }
  response.cookies.set(rememberedSessionCookie, "", { path: "/", maxAge: 0 });
  if (safeNext === "/reset-password") {
    const claims = await supabase.auth.getClaims(data.session.access_token);
    const destination = recoverySessionId(claims.data?.claims) ? "/reset-password" : "/forgot-password?error=verification";
    response.headers.set("Location", new URL(destination, webOrigin).href);
  }
  return response;
}
