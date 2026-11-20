const stableCode = /^[A-Z][A-Z0-9_]{0,63}$/;
const safeId = /^[0-9a-f-]{36}$/i;

export class ApiRequestError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryable = false, readonly requestId?: string) {
    super(code);
  }
}

export function apiErrorCode(cause: unknown) {
  return cause instanceof Error && stableCode.test(cause.message) ? cause.message : "API_ERROR";
}

export async function requestResponse(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch (cause) {
    if (init?.signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw cause;
    throw new ApiRequestError("NETWORK_ERROR", 0, true);
  }
  if (response.ok) return response;
  const payload = await response.json().catch(() => null);
  const serverCode = payload?.error?.code;
  const defaultCodes: Readonly<Record<number, string>> = {
    400: "INVALID_INPUT", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE",
    422: "INVALID_CONTENT", 429: "RATE_LIMITED", 503: "SERVICE_UNAVAILABLE",
  };
  const code = response.status === 401 ? "UNAUTHORIZED"
    : typeof serverCode === "string" && stableCode.test(serverCode) ? serverCode : defaultCodes[response.status] ?? "API_ERROR";
  const id = payload?.error?.requestId ?? response.headers.get("X-Request-ID");
  throw new ApiRequestError(code, response.status, response.status === 429 || response.status === 503,
    typeof id === "string" && safeId.test(id) ? id : undefined);
}

export async function requestJson(url: string, init?: RequestInit) {
  const response = await requestResponse(url, init);
  if (response.status === 204) return undefined;
  return response.json().catch(() => { throw new ApiRequestError("API_ERROR", response.status); });
}
