import { publicRequest } from "./api";

export type RegistrationPolicy = {
  enabled: boolean;
  mode: "public" | "invitation_only" | "closed";
  individualEnabled: boolean;
  organizationEnabled: boolean;
  referralsEnabled: boolean;
};

export function canRegister(policy: RegistrationPolicy | null) {
  return !!policy && policy.enabled && policy.mode !== "closed" && (policy.individualEnabled || policy.organizationEnabled);
}

export async function loadRegistrationPolicy(signal?: AbortSignal): Promise<RegistrationPolicy> {
  const value = await publicRequest("/api/v1/registration/policy", {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!value || !["public", "invitation_only", "closed"].includes(value.mode) ||
    [value.enabled, value.individualEnabled, value.organizationEnabled, value.referralsEnabled].some((flag) => typeof flag !== "boolean")) {
    throw new Error("Invalid registration policy");
  }
  return value;
}
