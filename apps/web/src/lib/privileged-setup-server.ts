import "server-only";
import { serverSupabase } from "@/lib/supabase/server";

export const workflowId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const workflowOrigin = process.env.WEB_ORIGIN ?? "http://localhost:4000";
export const founderCookie = (id: string) => "ayinou-f1-" + id;

export async function workflowRequest<T>(path: string, body?: object, member = false): Promise<T | null> {
  const headers = new Headers({ Accept: "application/json" });
  if (body) headers.set("Content-Type", "application/json");
  if (member) {
    const auth = await serverSupabase();
    const { data } = await auth.auth.getSession();
    if (!data.session?.access_token) return null;
    headers.set("Authorization", "Bearer " + data.session.access_token);
  }
  try {
    const response = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000") + path, {
      method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}

export async function founderEmailConfirmationEnabled() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(new URL("/auth/v1/settings", url), {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    return response.ok && (await response.json()).mailer_autoconfirm === false;
  } catch { return false; }
}
