import type { CommunityStats, Department, MemberProfile, ProfileChanges, ReferralSummary, StatusResponse } from "@ayinou/shared";
import { browserSupabase } from "./supabase/browser";
import { ApiRequestError, requestJson, requestResponse } from "./api-errors";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export async function fetchApiStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const data: unknown = await requestJson(`${apiBaseUrl}/api/v1/status`, {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (
    typeof data !== "object" || data === null ||
    !("status" in data) || data.status !== "ok" ||
    !("service" in data) || data.service !== "ayinou-api" ||
    !("version" in data) || data.version !== "v1"
  ) throw new Error("Unexpected API response");
  return data as StatusResponse;
}

async function sessionHeaders(init?: RequestInit) {
  const { data, error } = await browserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new ApiRequestError("UNAUTHORIZED", 401);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function authorizedRequest(path: string, init?: RequestInit) {
  return publicRequest(path, { ...init, headers: await sessionHeaders(init) });
}

export async function authorizedImage(path: string, signal: AbortSignal, guest = false) {
  const headers = guest ? new Headers() : await sessionHeaders();
  headers.set("Accept", "image/webp");
  const response = await requestResponse(`${apiBaseUrl}${path}`, { headers, signal });
  if (!response.headers.get("Content-Type")?.startsWith("image/webp")) throw new ApiRequestError("IMAGE_PROCESSING", 502);
  return response.blob();
}

export function publicRequest(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  return requestJson(`${apiBaseUrl}${path}`, { ...init, headers });
}

const pendingProfiles = new Map<string, Promise<MemberProfile>>();

export async function fetchMyProfile(signal?: AbortSignal): Promise<MemberProfile> {
  signal?.throwIfAborted();
  const headers = await sessionHeaders();
  signal?.throwIfAborted();
  const authorization = headers.get("Authorization")!;
  let pending = pendingProfiles.get(authorization);
  if (!pending) {
    // The page and the navbar can request the same profile. Share only the current read for this token.
    const deadline = AbortSignal.timeout(10_000);
    pending = publicRequest("/api/v1/me/profile", { headers, signal: deadline })
      .then((result: { profile: MemberProfile }) => result.profile)
      .catch((cause: unknown) => {
        if (deadline.aborted) throw new ApiRequestError("TIMEOUT", 0, true);
        throw cause;
      })
      .finally(() => pendingProfiles.delete(authorization));
    pendingProfiles.set(authorization, pending);
  }
  const profile = await pending;
  signal?.throwIfAborted();
  return profile;
}

export async function fetchAccountCodes(signal: AbortSignal) {
  const [member, referral, referrals]: [{ memberCode: string }, { referralCode: string }, { summary: ReferralSummary }] =
    await Promise.all([
      authorizedRequest("/api/v1/me/member-code", { signal }),
      authorizedRequest("/api/v1/me/referral-code", { signal }),
      authorizedRequest("/api/v1/me/referrals", { signal }),
    ]);
  return { ...member, ...referral, ...referrals.summary };
}

export async function validateReferralCode(code: string): Promise<boolean> {
  const result: { valid: boolean } = await publicRequest("/api/v1/referrals/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ code }),
  });
  return result.valid;
}

export async function updateMyProfile(input: ProfileChanges): Promise<MemberProfile> {
  const result: { profile: MemberProfile } = await authorizedRequest("/api/v1/me/profile/details", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.profile;
}

export async function encodeProfileImage(file: File): Promise<string> {
  if (file.size > 2_097_152 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("INVALID_AVATAR");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("INVALID_AVATAR"));
    reader.readAsDataURL(file);
  });
}

export async function uploadAvatar(file: File): Promise<string> {
  const data = await encodeProfileImage(file);
  const result: { avatarUrl: string } = await authorizedRequest("/api/v1/me/profile/avatar", {
    method: "POST", body: JSON.stringify({ image: data }),
  });
  return result.avatarUrl;
}

export async function fetchDepartments(signal?: AbortSignal): Promise<Department[]> {
  const result: { departments: Department[] } = await publicRequest("/api/v1/departments", { signal });
  return result.departments;
}

export async function fetchCommunityStats(signal?: AbortSignal): Promise<CommunityStats> {
  const result: { stats: CommunityStats } = await publicRequest("/api/v1/community/stats", { signal });
  return result.stats;
}
