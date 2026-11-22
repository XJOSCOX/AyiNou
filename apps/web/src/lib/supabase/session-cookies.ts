import { stringFromBase64URL, type CookieOptions } from "@supabase/ssr";

type SessionCookie = { name: string; value: string };

function authCookieBase(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export function cookieSessionId(url: string, current: SessionCookie[], updates: SessionCookie[] = []): string | undefined {
  const values = new Map([...current, ...updates].map(({ name, value }) => [name, value]));
  const base = authCookieBase(url);
  let raw = values.get(base) || "";
  if (!raw) {
    for (let index = 0; index < 16; index++) {
      const chunk = values.get(`${base}.${index}`);
      if (!chunk) break;
      raw += chunk;
    }
  }
  try {
    const session = JSON.parse(raw.startsWith("base64-") ? stringFromBase64URL(raw.slice(7)) : raw);
    const payload = session.access_token?.split(".")[1];
    const id = payload && JSON.parse(stringFromBase64URL(payload)).session_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

export function rememberedDeadline(url: string, current: SessionCookie[], updates: SessionCookie[]): string | undefined {
  const marker = current.find(({ name }) => name === rememberedSessionCookie)?.value;
  const [session, deadline] = marker?.split(":") ?? [];
  // Used only to reproduce cookie persistence. The database verifies session authority independently.
  return session && session === cookieSessionId(url, current, updates) ? deadline : undefined;
}

export const rememberedSessionCookie = "ayinou-remembered-session";

export function authCookieName(url: string, name: string): boolean {
  const base = authCookieBase(url);
  return name === base || name.startsWith(base + ".");
}

export function sessionCookieOptions(options: CookieOptions = {}, deadline?: string): CookieOptions {
  if (options.maxAge === 0) return options;
  const expiresAt = Number(deadline);
  const seconds = Math.floor((expiresAt - Date.now()) / 1000);
  return {
    ...options,
    expires: undefined,
    maxAge: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 30 * 24 * 60 * 60) : undefined,
  };
}
