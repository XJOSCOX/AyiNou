import "server-only";
import type { PolicyId } from "./paths";

type Availability = { enabled: boolean; policies: { policyId: PolicyId; version: string }[] };
const disabled: Availability = { enabled: false, policies: [] };

export async function legalAvailability(): Promise<Availability> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
  try {
    const response = await fetch(`${base}/api/v1/legal/availability`, {
      cache: "no-store", signal: AbortSignal.timeout(3_000), headers: { Accept: "application/json" },
    });
    if (!response.ok) return disabled;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("enabled" in data) || data.enabled !== true ||
      !("policies" in data) || !Array.isArray(data.policies)) return disabled;
    const policies = data.policies.filter((item): item is { policyId: PolicyId; version: string } =>
      typeof item === "object" && item !== null && "policyId" in item &&
      ["terms", "privacy", "community-guidelines", "organizations", "projects-and-volunteers",
        "voting", "verification", "cookies", "data-rights"].includes(String(item.policyId)) &&
      "version" in item && typeof item.version === "string");
    return { enabled: policies.length > 0, policies };
  } catch { return disabled; }
}
