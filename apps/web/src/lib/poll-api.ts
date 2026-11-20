import type { PollCard, PollConfigOptions, PollConfiguration, PollDetail, PollKind, PollNomination, PollScope } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export type PollContext = { scope: Exclude<PollScope, "individual">; scopeId: string };
export type PollDraft = PollConfiguration & {
  key: string; scope: PollScope; kind: PollKind; policy: "advisory" | "governance";
  scopeId: string | null; taskId: string | null; options: string[];
};
const json = (method: string, data: object) => ({ method, body: JSON.stringify(data) });
const polls = "/api/v1/polls";
const own = "/api/v1/me/polls";

export const loadPolls = (mine: boolean, context: PollContext | null, cursor: string | null, signal: AbortSignal):
  Promise<{ items: PollCard[]; nextCursor: string | null }> =>
  authorizedSocialRequest((mine ? own : polls) + "?" + new URLSearchParams({ ...context, ...(cursor ? { cursor } : {}) }), { signal });
export const loadPoll = (id: string, signal: AbortSignal): Promise<PollDetail> => authorizedSocialRequest(polls + "/" + id, { signal });
export const loadPollOptions = (signal: AbortSignal): Promise<PollConfigOptions> => authorizedSocialRequest(own + "/options", { signal });
export const loadNominations = (signal: AbortSignal): Promise<{ nominations: PollNomination[] }> =>
  authorizedSocialRequest(own + "/nominations", { signal });
export const savePoll = (body: PollDraft): Promise<{ id: string }> => authorizedSocialRequest(polls, json("POST", body));
export const editPoll = (id: string, body: PollConfiguration & { version: number; options?: string[] }) =>
  authorizedSocialRequest(polls + "/" + id, json("PATCH", body));
export const castBallot = (id: string, optionId: string) =>
  authorizedSocialRequest(polls + "/" + id + "/ballot", json("POST", { optionId }));
export const loadOwnBallot = (id: string): Promise<{ optionId: string | null }> =>
  authorizedSocialRequest(polls + "/" + id + "/ballot");
export const transitionPoll = (id: string, input: Record<string, string | number>) =>
  authorizedSocialRequest(polls + "/" + id + "/transition", json("POST", input));
export const respondToNomination = (poll: string, option: string, response: "accepted" | "declined" | "withdrawn") =>
  authorizedSocialRequest(polls + "/" + poll + "/nominations/" + option, json("POST", { response }));
