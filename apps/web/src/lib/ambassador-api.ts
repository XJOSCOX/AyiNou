import type { AmbassadorAdminAction, AmbassadorAdminPage, AmbassadorCase, AmbassadorCategory, PublicAmbassador } from "@ayinou/shared";
import { publicRequest } from "./api";
import { authorizedSocialRequest } from "./feed-api";

const mine = "/api/v1/me/ambassadors";
const admin = "/api/v1/admin/ambassadors";
const json = (method: string, value: object) => ({ method, body: JSON.stringify(value) });

export function loadAmbassadors(signedIn: boolean, q: string, category: string, cursor: string | null, signal: AbortSignal):
  Promise<{ ambassadors: PublicAmbassador[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(cursor && { cursor }) });
  return (signedIn ? authorizedSocialRequest : publicRequest)(`/api/v1/ambassadors?${query}`, { signal });
}

export const loadMyAmbassadorCases = (signal: AbortSignal): Promise<{ cases: AmbassadorCase[] }> =>
  authorizedSocialRequest(mine, { signal });

type MemberAction = { action: "accept" | "decline" | "withdraw" } |
  { action: "publish"; publish: boolean; statement: string | null } | { action: "request_review"; reason: string };
export const changeAmbassadorCase = ({ id, version }: AmbassadorCase, input: MemberAction): Promise<void> =>
  authorizedSocialRequest(`${mine}/${id}`, json("PATCH", { version, ...input }));

export function loadAmbassadorAdmin(handle: string, cursor: string | null, signal: AbortSignal): Promise<AmbassadorAdminPage> {
  const query = new URLSearchParams({ ...(handle && { handle }), ...(cursor && { cursor }) });
  return authorizedSocialRequest(`${admin}?${query}`, { signal });
}
export const proposeAmbassador = (username: string, category: AmbassadorCategory, reason: string): Promise<{ id: string }> =>
  authorizedSocialRequest(admin, json("POST", { username, category, reason }));
export const decideAmbassador = ({ id, version }: AmbassadorCase, action: AmbassadorAdminAction, reason: string): Promise<void> =>
  authorizedSocialRequest(`${admin}/${id}`, json("PATCH", { version, action, reason }));
