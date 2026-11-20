import type { FastifyInstance, FastifyRequest } from "fastify";
import { pollDecisions, pollKinds, pollScopes, type PollCard, type PollConfigOptions, type PollDetail, type PollNomination } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const id = z.strictObject({ id: z.uuid() });
const version = z.number().int().positive().max(2147483647);
const inputOptions = z.array(z.string().trim().min(1).max(120)).min(2).max(10);
const date = z.iso.datetime({ offset: true });
const config = {
  title: z.string().trim().min(3).max(120), description: z.string().trim().min(3).max(2000),
  language: z.enum(["ht", "fr", "en", "es"]), audience: z.enum(["members", "scope"]), eligibility: z.enum(["active", "verified"]),
  resultPolicy: z.enum(["after_vote", "after_close"]), opensAt: date, closesAt: date,
  quorum: z.number().int().min(1).max(5000).nullable(), threshold: z.number().int().min(50).max(100).nullable(),
};
const create = z.strictObject({ ...config, key: z.uuid(), scope: z.enum(pollScopes), kind: z.enum(pollKinds),
  policy: z.enum(["advisory", "governance"]), scopeId: z.uuid().nullable(), taskId: z.uuid().nullable(), options: inputOptions });
const edit = z.strictObject({ ...config, version, options: inputOptions.optional() });
const reason = z.string().trim().min(3).max(600);
const transition = z.discriminatedUnion("action", [
  z.strictObject({ action: z.enum(["publish", "close"]), version }),
  z.strictObject({ action: z.enum(["cancel", "moderate_cancel"]), version, reason }),
  z.strictObject({ action: z.literal("record_decision"), version, reason, disposition: z.enum(pollDecisions) }),
]);
const query = z.strictObject({ scope: z.enum(["community", "organization", "project"]).optional(), scopeId: z.uuid().optional(),
  cursor: z.string().max(128).optional() })
  .refine(({ scope, scopeId }) => !!scope === !!scopeId);

export function registerPollRoutes(app: FastifyInstance, { viewer, repo, read }: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository; read: ReadBudget;
}) {
  const polls = "/api/v1/polls";
  const own = "/api/v1/me/polls";
  for (const mine of [false, true]) {
    app.get(mine ? own : polls, async (request) => {
      const { actor, token } = await viewer(request, true);
      await read("discovery", actor, request.ip);
      const input = query.parse(request.query);
      const [before, beforeId] = input.cursor ? z.tuple([date, z.uuid()]).parse(input.cursor.split("|")) : [null, null];
      const rows = await repo().rpc<PollCard[]>(token, "polls_for_client", { p_mine: mine, p_scope: input.scope ?? null,
        p_scope_id: input.scopeId ?? null, p_before: before, p_before_id: beforeId });
      const items = rows.slice(0, 20);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > 20 && last ? last.createdAt + "|" + last.id : null };
    });
  }
  app.get(own + "/options", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return repo().rpc<PollConfigOptions>(token, "poll_config_options_for_client");
  });
  app.get(own + "/nominations", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { nominations: await repo().rpc<PollNomination[]>(token, "poll_nominations_for_client") };
  });
  for (const projection of ["", "/results", "/ballot"] as const) {
    app.get(polls + "/:id" + projection, async (request) => {
      const { actor, token } = await viewer(request, true);
      await read("profile", actor, request.ip);
      const serverNow = Date.now();
      const detail = await repo().rpc<PollDetail>(token, "poll_detail_for_client", { p_id: id.parse(request.params).id });
      if (projection === "/ballot") return { optionId: detail.ownBallot };
      if (projection === "") return { ...detail, serverNow };
      if (!detail.results) throw new ApiError(409, "POLL_RESULT_UNAVAILABLE", "Results are not available");
      return detail.results;
    });
  }
  app.post(polls, { bodyLimit: 10_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const result = await repo().rpc<{ id: string; version: number }>(token, "poll_save_for_client",
      { p_id: null, p_input: create.parse(request.body) });
    return reply.code(201).send(result);
  });
  app.patch(polls + "/:id", { bodyLimit: 10_000 }, async (request) => {
    const { token } = await viewer(request, true);
    return repo().rpc(token, "poll_save_for_client", { p_id: id.parse(request.params).id, p_input: edit.parse(request.body) });
  });
  app.post(polls + "/:id/ballot", { bodyLimit: 512 }, async (request) => {
    const { token } = await viewer(request, true);
    const { optionId } = z.strictObject({ optionId: z.uuid() }).parse(request.body);
    return repo().rpc(token, "poll_vote_for_client", { p_id: id.parse(request.params).id, p_option: optionId });
  });
  app.post(polls + "/:id/transition", { bodyLimit: 5000 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = transition.parse(request.body);
    return repo().rpc(token, "poll_transition_for_client", { p_id: id.parse(request.params).id, p_action: input.action,
      p_version: input.version, p_reason: "reason" in input ? input.reason : null, p_disposition: "disposition" in input ? input.disposition : null });
  });
  app.post(polls + "/:id/nominations/:option", { bodyLimit: 512 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const params = id.extend({ option: z.uuid() }).parse(request.params);
    const { response } = z.strictObject({ response: z.enum(["accepted", "declined", "withdrawn"]) }).parse(request.body);
    await repo().rpc(token, "poll_nomination_for_client", { p_id: params.id, p_option: params.option, p_response: response });
    return reply.code(204).send();
  });
}
