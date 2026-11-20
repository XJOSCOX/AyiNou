import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookie, localeMaxAge } from "@/lib/i18n";

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
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => {
          response.headers.set(name, value);
          authHeaders.set(name, value);
        });
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
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
  matcher: ["/dashboard/:path*", "/profile/:path*", "/onboarding/:path*", "/settings/:path*", "/institutions/:path*", "/verification/:path*", "/admin/:path*", "/feed/:path*", "/discover/:path*", "/communities/:path*", "/members/:path*", "/posts/:path*", "/notifications/:path*", "/mfa"],
};
