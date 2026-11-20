import type { FastifyInstance, FastifyRequest } from "fastify";
import { ambassadorAdminActions, ambassadorCategories, type AmbassadorAdminPage, type AmbassadorCase, type PublicAmbassador } from "@ayinou/shared";
import { z } from "zod";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const id = z.strictObject({ id: z.uuid() });
const version = z.number().int().positive().max(2147483647);
const text = (maximum: number) => z.string().trim().max(maximum).refine((value) => !/\p{Cc}/u.test(value.replace(/[\r\n\t]/g, "")));
const reason = text(1000).refine((value) => value.length >= 10);
const category = z.enum(ambassadorCategories);
const directoryQuery = z.strictObject({ q: text(80).optional(), category: category.optional(), cursor: username.optional() });
const adminQuery = z.strictObject({ handle: username.optional(), cursor: z.string().max(100).optional() });
const adminCursor = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);
const memberAction = z.discriminatedUnion("action", [
  z.strictObject({ version, action: z.enum(["accept", "decline", "withdraw"]) }),
  z.strictObject({ version, action: z.literal("publish"), publish: z.boolean(), statement: text(500).nullable() }),
  z.strictObject({ version, action: z.literal("request_review"), reason }),
]);

export function registerAmbassadorRoutes(app: FastifyInstance, { viewer, repo, read }: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const mine = "/api/v1/me/ambassadors";
  const administration = "/api/v1/admin/ambassadors";
  type DirectoryRow = Omit<PublicAmbassador, "avatarUrl"> & { avatarPath: string | null };

  app.get("/api/v1/ambassadors", async (request) => {
    const { token, actor } = await viewer(request);
    await read("discovery", actor, request.ip);
    const { q, category: selected, cursor } = directoryQuery.parse(request.query);
    const size = 15;
    const rows = await repo().rpc<DirectoryRow[]>(token, "ambassador_directory_for_client", {
      p_handle: null, p_query: q ?? "", p_category: selected ?? null, p_after: cursor ?? null, p_limit: size,
    });
    const page = rows.slice(0, size);
    const avatars = await repo().signAvatars?.(page.flatMap(({ avatarPath }) => avatarPath ? [avatarPath] : []));
    return {
      ambassadors: page.map(({ avatarPath, ...person }) => ({ ...person, avatarUrl: avatarPath ? avatars?.get(avatarPath) ?? null : null })),
      nextCursor: rows.length > size ? page.at(-1)?.username ?? null : null,
    };
  });
  app.get("/api/v1/members/:username/ambassador", async (request) => {
    const { token, actor } = await viewer(request);
    await read("profile", actor, request.ip);
    const { username: handle } = z.strictObject({ username }).parse(request.params);
    const [row] = await repo().rpc<DirectoryRow[]>(token, "ambassador_directory_for_client", {
      p_handle: handle, p_query: "", p_category: null, p_after: null, p_limit: 1,
    });
    return { ambassador: row ? { category: row.category, statement: row.statement } : null };
  });
  app.get(mine, async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { cases: await repo().rpc<AmbassadorCase[]>(token, "ambassador_own_for_client") };
  });
  app.patch(mine + "/:id", { bodyLimit: 6_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = memberAction.parse(request.body);
    await repo().rpc(token, "ambassador_member_action_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_action: input.action,
      p_publish: "publish" in input ? input.publish : null, p_statement: "statement" in input ? input.statement : null,
      p_reason: "reason" in input ? input.reason : null,
    });
    return reply.code(204).send();
  });
  app.get(administration, async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    const { handle, cursor } = adminQuery.parse(request.query);
    const [before, beforeId] = cursor ? adminCursor.parse(cursor.split("|")) : [null, null];
    const { candidate, cases } = await repo().rpc<Omit<AmbassadorAdminPage, "nextCursor">>(token, "ambassador_admin_list_for_client", {
      p_handle: handle ?? null, p_before: before, p_before_id: beforeId,
    });
    const page = cases.slice(0, 20);
    const last = page.at(-1);
    return { candidate, cases: page, nextCursor: cases.length > 20 && last ? last.createdAt + "|" + last.id : null };
  });
  app.post(administration, { bodyLimit: 6_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ username, category, reason }).parse(request.body);
    const caseId = await repo().rpc<string>(token, "ambassador_propose_for_client",
      { p_handle: input.username, p_category: input.category, p_reason: input.reason });
    return reply.code(201).send({ id: caseId });
  });
  app.patch(administration + "/:id", { bodyLimit: 6_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, action: z.enum(ambassadorAdminActions), reason }).parse(request.body);
    await repo().rpc(token, "ambassador_admin_action_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_action: input.action, p_reason: input.reason,
    });
    return reply.code(204).send();
  });
}
