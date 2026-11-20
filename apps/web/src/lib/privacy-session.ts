import { publicRequest } from "./api";
import { ApiRequestError, requestResponse } from "./api-errors";
import { browserSupabase } from "./supabase/browser";

async function headersFor(actor: string, init: RequestInit) {
  init.signal?.throwIfAborted();
  const { data, error } = await browserSupabase().auth.getSession();
  init.signal?.throwIfAborted();
  if (error || !data.session || data.session.user.id !== actor) throw new ApiRequestError("UNAUTHORIZED", 401);
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + data.session.access_token);
  return headers;
}

export async function ownPrivacyRequest<T>(actor: string, path: string, init: RequestInit): Promise<T> {
  return publicRequest(path, { ...init, cache: "no-store", headers: await headersFor(actor, init) });
}

export async function privacyExportDownload(actor: string, artifact: string, signal: AbortSignal) {
  const origin = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  const headers = await headersFor(actor, { signal });
  const response = await requestResponse(origin + "/api/v1/me/privacy-exports/" + artifact + "/download",
    { signal, headers, redirect: "error", referrerPolicy: "no-referrer" });
  return response.blob();
}
