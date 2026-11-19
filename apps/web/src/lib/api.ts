import type { ApiErrorResponse, CommunityStats, Department, MemberProfile, ProfileChanges, StatusResponse } from "@ayinou/shared";
import { browserSupabase } from "./supabase/browser";

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

async function authorizedRequest(path: string, init?: RequestInit) {
  const { data, error } = await browserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("UNAUTHORIZED");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("UNAUTHORIZED");
    const result: ApiErrorResponse | null = await response.json().catch(() => null);
    throw new Error(result?.error?.code ?? "API_ERROR");
  }
  return response.json();
}

export async function fetchMyProfile(): Promise<MemberProfile> {
  const result: { profile: MemberProfile } = await authorizedRequest("/api/v1/me/profile");
  return result.profile;
}

export async function updateMyProfile(input: ProfileChanges): Promise<MemberProfile> {
  const result: { profile: MemberProfile } = await authorizedRequest("/api/v1/me/profile/details", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.profile;
}

export async function uploadAvatar(file: File): Promise<string> {
  if (file.size > 2_097_152 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("INVALID_AVATAR");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("INVALID_AVATAR"));
    reader.readAsDataURL(file);
  });
  const result: { avatarUrl: string } = await authorizedRequest("/api/v1/me/profile/avatar", {
    method: "POST", body: JSON.stringify({ image: data }),
  });
  return result.avatarUrl;
}

export async function fetchDepartments(): Promise<Department[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/departments`, { cache: "no-store" });
  if (!response.ok) throw new Error("API_ERROR");
  const result: { departments: Department[] } = await response.json();
  return result.departments;
}

export async function fetchCommunityStats(signal?: AbortSignal): Promise<CommunityStats> {
  const response = await fetch(`${apiBaseUrl}/api/v1/community/stats`, {
    headers: { Accept: "application/json" }, cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("API_ERROR");
  const result: { stats: CommunityStats } = await response.json();
  return result.stats;
}
