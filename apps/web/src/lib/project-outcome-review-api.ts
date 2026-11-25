import type { MemberOutcomeReview, OutcomePage, OutcomeReviewCase, OutcomeReviewEvent, OutcomeReviewNotice,
  OutcomeReviewerRoster, OutcomeReviewStatus, OutcomeReviewSummary, OutcomeStaffLane, ReleasedOutcomeEvidence } from "@ayinou/shared";
import { authorizedImage } from "./api";
import { authorizedSocialRequest } from "./feed-api";

export const outcomeReviewPath = "/projects/review/outcomes";
const base = "/api/v1/private/project-outcome-review";
const memberPath = (project: string, id: string) => "/api/v1/projects/" + project + "/outcome-validation/" + id + "/review";
const headers = (workspace: string) => ({ "X-Ayinou-Workspace": workspace });
const withQuery = (path: string, query: Record<string, string>) => path + "?" + new URLSearchParams(query);
const read = (path: string, signal: AbortSignal, workspace?: string) =>
  authorizedSocialRequest(path, { signal, cache: "no-store", headers: workspace ? headers(workspace) : undefined });
const write = (path: string, method: string, body: string, workspace?: string) =>
  authorizedSocialRequest(path, { method, body, cache: "no-store", headers: workspace ? headers(workspace) : undefined });

export const openOutcomeReview = (lane: OutcomeStaffLane): Promise<{ id: string; expiresAt: string }> =>
  write(base + "/workspace", "POST", JSON.stringify({ lane }));

export const loadOutcomeReviewNotices = (signal: AbortSignal): Promise<OutcomeReviewNotice[]> => read(base + "/notices", signal);
export const loadMemberOutcomeReview = (project: string, id: string, signal: AbortSignal):
  Promise<MemberOutcomeReview | { unavailable: true }> => read(memberPath(project, id), signal);
export const changeMemberOutcomeReview = (project: string, id: string, body: string) => write(memberPath(project, id), "PATCH", body);

export const loadOutcomeReviewQueue = (workspace: string, lane: OutcomeStaffLane, department: string,
  status: OutcomeReviewStatus | "", after: string | null, signal: AbortSignal): Promise<OutcomePage<OutcomeReviewSummary>> =>
  read(withQuery(base, { lane, department, ...(after && { after }), ...(status && { status }) }), signal, workspace);
export const loadOutcomeRoster = (workspace: string, department: string, search: string, signal: AbortSignal): Promise<OutcomeReviewerRoster> =>
  read(withQuery(base + "/roster", { department, ...(search && { search }) }), signal, workspace);
export const changeOutcomeRoster = (workspace: string, body: string) => write(base + "/roster", "POST", body);

export const loadStaffOutcomeCase = (workspace: string, lane: OutcomeStaffLane, id: string, signal: AbortSignal):
  Promise<OutcomeReviewCase & { history?: OutcomeReviewEvent[] }> => read(withQuery(base + "/" + id, { lane }), signal, workspace);
export const changeStaffOutcomeCase = (workspace: string, lane: OutcomeStaffLane, id: string, body: string) =>
  write(withQuery(base + "/" + id, { lane }), "PATCH", body, workspace);
export const loadReleasedOutcomeEvidence = (workspace: string, id: string, version: number, signal: AbortSignal):
  Promise<ReleasedOutcomeEvidence> => read(withQuery(base + "/" + id + "/evidence", { expectedVersion: String(version) }), signal, workspace);
export const loadReleasedOutcomeImage = (workspace: string, id: string, entry: string, sourceRevision: number, version: number,
  signal: AbortSignal) => authorizedImage(withQuery(base + "/" + id + "/evidence/" + entry + "/image",
    { expectedVersion: String(version), sourceRevision: String(sourceRevision) }), signal, false, headers(workspace));
