import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookie, localeMaxAge } from "@/lib/i18n";
import { authCookieName, rememberedDeadline, rememberedSessionCookie, sessionCookieOptions } from "@/lib/supabase/session-cookies";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const authHeaders = new Headers();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, cacheHeaders) {
        const deadline = rememberedDeadline(url, request.cookies.getAll(), cookiesToSet);
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options, deadline)));
        Object.entries(cacheHeaders).forEach(([name, value]) => {
          response.headers.set(name, value);
          authHeaders.set(name, value);
        });
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (claims?.sub && !claims.is_anonymous) {
    const { data: live, error } = await supabase.rpc("account_session_active");
    if (error) return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (!live) {
      const { data: eligible } = await supabase.rpc("s2a_observe_expiry");
      const destination = eligible === true ? "/login?session=ended" : "/account-access";
      const redirected = NextResponse.redirect(new URL(destination, request.url), { headers: { "Cache-Control": "no-store" } });
      if (destination === "/account-access") return redirected;
      for (const { name } of request.cookies.getAll()) {
        if (authCookieName(url, name) || name === rememberedSessionCookie) {
          redirected.cookies.set(name, "", { maxAge: 0, path: "/" });
        }
      }
      return redirected;
    }
  }
  if (claims?.sub && !claims.is_anonymous && !isLocale(request.cookies.get(localeCookie)?.value)) {
    const { data: profile } = await supabase.from("profiles").select("display_name,preferred_locale")
      .eq("user_id", claims.sub).maybeSingle();
    const registration = claims.user_metadata?.preferred_locale;
    const preferred = !profile?.display_name && isLocale(registration) ? registration : profile?.preferred_locale;
    if (isLocale(preferred)) {
      const sessionCookies = response.cookies.getAll();
      request.cookies.set(localeCookie, preferred);
      response = NextResponse.next({ request });
      sessionCookies.forEach((cookie) => response.cookies.set(cookie));
      authHeaders.forEach((value, key) => response.headers.set(key, value));
      response.cookies.set(localeCookie, preferred, { maxAge: localeMaxAge, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
    }
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/onboarding/:path*", "/organization-onboarding", "/reset-password", "/settings/:path*", "/institutions/:path*", "/verification", "/feed/:path*", "/discover/:path*", "/communities/:path*", "/members/:path*", "/posts/:path*", "/projects/:path*", "/polls/:path*", "/notifications/:path*", "/ambassadors", "/mfa", "/activate/a/:path*"],
};
