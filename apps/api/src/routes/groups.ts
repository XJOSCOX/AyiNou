import type { FastifyInstance, FastifyRequest } from "fastify";
import { communityStaffRoles, groupKinds, groupPolicies, interestCodes } from "@ayinou/shared";
import { z } from "zod";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const slug = z.string().max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const key = z.object({ key: slug });
const handle = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const section = z.enum(["requests", "invitations", "staff"]);
const limit = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(24)).optional();
const country = z.string().regex(/^[A-Z]{2}$/);
const singleLine = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum).refine((value) => !/\p{Cc}/u.test(value));
const textBlock = (maximum: number) => z.string().trim().min(10).max(maximum).refine((value) => !/\p{Cc}/u.test(value.replace(/[\r\n\t]/g, "")));
const settings = z.strictObject({
  name: singleLine(3, 80), description: textBlock(500), rules: textBlock(2000),
  policy: z.enum(groupPolicies), discussionPublic: z.boolean(),
  countryCode: country.nullable(), topic: z.enum(interestCodes).nullable(),
});
const profileFields = (input: z.output<typeof settings>) => ({
  p_name: input.name, p_description: input.description, p_rules: input.rules, p_policy: input.policy,
  p_public: input.discussionPublic, p_country: input.countryCode, p_topic: input.topic,
});
const action = z.discriminatedUnion("action", [
  z.strictObject({ action: z.enum(["invite", "approve", "reject", "remove", "transfer", "recover"]), handle }),
  z.strictObject({ action: z.literal("staff"), handle, role: z.enum(communityStaffRoles).nullable() }),
  z.strictObject({ action: z.literal("revoke"), invitationId: z.uuid() }),
]);

function paginate<T>(rows: T[], size: number, position: (row: T) => string) {
  const values = rows.slice(0, size);
  return { values, nextCursor: rows.length > size ? position(values[size - 1]!) : null };
}

export function registerGroupRoutes(app: FastifyInstance, context: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const { viewer, repo, read } = context;
  const base = "/api/v1/communities";
  app.get(base + "/groups", async (request) => {
    const query = z.strictObject({
      kind: z.enum(groupKinds).optional(), mine: z.enum(["true", "false"]).optional(),
      search: z.string().trim().max(80).optional(), country: country.optional(), topic: z.enum(interestCodes).optional(),
      cursor: slug.optional(), limit,
    }).parse(request.query);
    const mine = query.mine === "true";
    const { actor, token } = await viewer(request, mine);
    await read("discovery", actor, request.ip);
    const size = query.limit ?? 18;
    const rows = await repo().rpc<{ slug: string }[]>(token, "member_groups_for_client", {
      p_kind: query.kind ?? null, p_mine: mine, p_search: query.search || null, p_country: query.country ?? null,
      p_topic: query.topic ?? null, p_after: query.cursor ?? null, p_limit: size,
    });
    const { values, nextCursor } = paginate(rows, size, (row) => row.slug);
    return { communities: values, nextCursor };
  });
  app.post(base, { bodyLimit: 13_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = settings.extend({ kind: z.enum(groupKinds), slug }).parse(request.body);
    const community = await repo().rpc(token, "create_member_group_for_client", {
      ...profileFields(input), p_kind: input.kind, p_slug: input.slug, p_submission: z.uuid().parse(request.headers["idempotency-key"]),
    });
    return reply.code(201).send({ community });
  });
  app.patch(base + "/:key/settings", { bodyLimit: 13_000 }, async (request) => {
    const { key: group } = key.parse(request.params);
    const { token } = await viewer(request, true);
    const input = settings.extend({ version: z.number().int().min(1).max(2_147_483_647) }).parse(request.body);
    return { community: await repo().rpc(token, "update_member_group_for_client", {
      ...profileFields(input), p_key: group, p_version: input.version,
    }) };
  });
  app.get(base + "/:key/management/:section", async (request) => {
    const { key: group, section: view } = key.extend({ section }).parse(request.params);
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const query = z.strictObject({ cursor: (view === "invitations" ? z.uuid() : handle).optional(), limit }).parse(request.query);
    const size = query.limit ?? 18;
    const rows = await repo().rpc<Array<{ id?: string; handle: string }>>(token, "group_management_for_client", {
      p_key: group, p_section: view, p_after: query.cursor ?? null, p_limit: size,
    });
    const { values, nextCursor } = paginate(rows, size, (row) => row.id ?? row.handle);
    return { entries: values, nextCursor };
  });
  app.post(base + "/:key/management", { bodyLimit: 4_096 }, async (request) => {
    const { key: group } = key.parse(request.params);
    const { token } = await viewer(request, true);
    const body = request.body;
    const { reason, ...details } = z.object({ reason: singleLine(10, 500) }).passthrough().parse(body);
    const input = action.parse(details);
    const invitationId = await repo().rpc<string | null>(token, "group_manage_member_for_client", {
      p_key: group, p_action: input.action, p_handle: "handle" in input ? input.handle : null,
      p_role: "role" in input ? input.role : null, p_reason: reason,
      p_invitation: "invitationId" in input ? input.invitationId : null,
    });
    return { invitationId };
  });
  const inbox = "/api/v1/me/community-invitations";
  app.get(inbox, async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const query = z.strictObject({ cursor: z.uuid().optional(), limit }).parse(request.query);
    const size = query.limit ?? 18;
    const rows = await repo().rpc<Array<{ id: string }>>(token, "group_inbox_for_client", { p_after: query.cursor ?? null, p_limit: size });
    const { values, nextCursor } = paginate(rows, size, (row) => row.id);
    return { invitations: values, nextCursor };
  });
  app.patch(inbox + "/:id", { bodyLimit: 1024 }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { accept } = z.strictObject({ accept: z.boolean() }).parse(request.body);
    const { token } = await viewer(request, true);
    await repo().rpc(token, "respond_group_invitation_for_client", { p_id: id, p_accept: accept });
    return reply.code(204).send();
  });
}
