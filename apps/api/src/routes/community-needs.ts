import type { FastifyInstance, FastifyRequest } from "fastify";
import { communityNeedCategories, type CommunityNeed, type CommunityNeedList } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const path = "/api/v1/me/community-needs";
const idParam = z.strictObject({ id: z.uuid() });
const line = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/\p{Cc}/u.test(value));
const publicReference = /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(\/[a-zA-Z0-9/_.~%-]*)?$/;
const privateHost = /^https:\/\/(?:[^/]+\.)?(?:localhost|local|internal|test|invalid|example|onion|lan|home|corp|arpa)(\/|$)/;
const content = z.strictObject({
  title: line(1, 100),
  description: z.string().trim().max(3000).refine((value) => !/\p{Cc}/u.test(value.replace(/[\t\r\n]/g, ""))),
  category: z.enum(communityNeedCategories),
  area: line(1, 60).regex(/^\p{L}[\p{L}\p{M} .'’,-]*$/u).nullable(),
  beneficiaries: line(0, 200),
  references: z.array(z.strictObject({
    url: line(1, 500).refine((value) => publicReference.test(value) && !privateHost.test(value)
      && !/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(value)),
    description: line(0, 160),
  })).max(4).refine((value) => new Set(value.map(({ url }) => url)).size === value.length),
});
const create = z.strictObject({ communityId: z.uuid(), content });
const expected = z.number().int().min(1).max(2147483646);
const update = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("edit"), expectedRevision: expected, content }),
  z.strictObject({ action: z.literal("submit"), expectedRevision: expected, confirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("withdraw"), expectedRevision: expected, confirmed: z.literal(true) }),
]);

export function registerCommunityNeeds(app: FastifyInstance, options: {
  enabled: boolean; auth: AuthVerifier | null; repo: InstitutionRepository | null; read: ReadBudget;
}) {
  const { enabled, auth, repo, read } = options;
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
  });

  async function execute<T>(request: FastifyRequest, action: string, input: Record<string, unknown> = {}) {
    if (!enabled) throw new ApiError(404, "COMMUNITY_NEEDS_DISABLED", "Community needs intake is unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Community needs unavailable");
    const session = await auth.verifySession(token);
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (await auth.memberFeatureAccess?.(token) === false) {
      throw new ApiError(403, "ONBOARDING_REQUIRED", "Complete member onboarding first");
    }
    await read("profile", session.actor, request.ip);
    try {
      return await repo.rpc<T>("c11_needs_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_action: action,
        p_id: null, p_community: null, p_request: null, p_expected: null, p_content: null, p_confirmed: null, ...input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) {
        throw new ApiError(error.statusCode, error.code, "Community need request could not be processed");
      }
      throw error;
    }
  }

  app.get(path, async (request) => {
    const { cursor } = z.strictObject({ cursor: z.uuid().optional() }).parse(request.query);
    const result = await execute<Omit<CommunityNeedList, "nextCursor">>(request, "list", { p_id: cursor ?? null });
    const needs = result.needs.slice(0, 20);
    return { ...result, needs, nextCursor: result.needs.length > 20 ? needs.at(-1)!.id : null };
  });
  app.get(path + "/:id", async (request) => execute<CommunityNeed>(request, "read", { p_id: idParam.parse(request.params).id }));
  app.post(path, { bodyLimit: 32_000 }, async (request, reply) => {
    const input = create.parse(request.body);
    const result = await execute<CommunityNeed>(request, "create", {
      p_community: input.communityId, p_content: input.content, p_request: z.uuid().parse(request.headers["idempotency-key"]),
    });
    return reply.code(201).send(result);
  });
  app.patch(path + "/:id", { bodyLimit: 32_000 }, async (request) => {
    const { id } = idParam.parse(request.params);
    const input = update.parse(request.body);
    return execute<CommunityNeed>(request, input.action, {
      p_id: id, p_expected: input.expectedRevision, p_request: z.uuid().parse(request.headers["idempotency-key"]),
      p_content: input.action === "edit" ? input.content : null,
      p_confirmed: input.action === "edit" ? null : input.confirmed,
    });
  });
}
