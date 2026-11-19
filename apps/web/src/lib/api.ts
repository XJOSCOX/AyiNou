import type { StatusResponse } from "@ayinou/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export async function fetchApiStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/status`, {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("API unavailable");
  const data: unknown = await response.json();
  if (
    typeof data !== "object" || data === null ||
    !("status" in data) || data.status !== "ok" ||
    !("service" in data) || data.service !== "ayinou-api" ||
    !("version" in data) || data.version !== "v1"
  ) throw new Error("Unexpected API response");
  return data as StatusResponse;
}
