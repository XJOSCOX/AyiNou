"use client";

import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { authCookieName, cookieSessionId, rememberedDeadline, rememberedSessionCookie, sessionCookieOptions } from "./session-cookies";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function browserSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase browser configuration is missing");
    client = createBrowserClient(url, key, {
      cookies: {
        getAll: browserCookies,
        setAll(cookies) {
          const deadline = rememberedDeadline(url, browserCookies(), cookies);
          for (const { name, value, options } of cookies) {
            document.cookie = serializeCookieHeader(name, value, sessionCookieOptions(options, deadline));
          }
          const authCookies = cookies.filter(({ name }) => authCookieName(url, name));
          if (authCookies.length && authCookies.every(({ options }) => options.maxAge === 0)) {
            setRememberedSession(null);
          }
        },
      },
    });
  }
  return client;
}

function browserCookies() {
  if (typeof document === "undefined") return [];
  return parseCookieHeader(document.cookie).flatMap(({ name, value }) => value === undefined ? [] : [{ name, value }]);
}

export function setRememberedSession(expiresAt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cookies = browserCookies();
  const session = expiresAt && url ? cookieSessionId(url, cookies) : undefined;
  const deadline = session && expiresAt ? String(Date.parse(expiresAt)) : undefined;
  const options = sessionCookieOptions({ path: "/", sameSite: "lax", secure: location.protocol === "https:" }, deadline);
  document.cookie = serializeCookieHeader(rememberedSessionCookie, deadline ? `${session}:${deadline}` : "", deadline ? options : { ...options, maxAge: 0 });
  if (!deadline || !url) return;
  for (const { name, value } of cookies) {
    if (authCookieName(url, name)) document.cookie = serializeCookieHeader(name, value, options);
  }
}
