import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rememberedDeadline, sessionCookieOptions } from "./session-cookies";

export async function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          const deadline = rememberedDeadline(url, cookieStore.getAll(), cookiesToSet);
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, sessionCookieOptions(options, deadline)));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}
