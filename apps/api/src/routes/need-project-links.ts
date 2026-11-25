import type { FastifyInstance, FastifyRequest } from "fastify";
import { needProjectLinkCommands } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import { InstitutionError } from "../services/institutions.js";
import { needRequestContext, type NeedRouteOptions } from "./community-needs-review.js";

const id = z.uuid();
const params = z.strictObject({ id });
const cursor = z.strictObject({ after: id.optional() });
const lane = z.strictObject({ lane: z.enum(["member","admin","review"]).default("member") });
const version = z.number().int().min(1).max(2147483646);
const receipt = { confirmed: z.literal(true), requestId: id };
const reason = z.string().trim().min(5).max(1500).refine((value) => !/\p{Cc}/u.test(value));
const create = z.strictObject({ ...receipt, project: id, projectVersion: version, publication: id,
  reason: reason.refine((value) => value.length <= 600) });
const change = z.strictObject({ ...receipt, expectedRevision: version,
  action: z.enum(needProjectLinkCommands), target: id.optional(), reason: reason.optional(), relationshipConfirmed: z.literal(true).optional() });

export function registerNeedProjectLinks(app: FastifyInstance, options: NeedRouteOptions) {
  const root = "/api/v1/private/need-project-links";
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control","private, no-store").header("Referrer-Policy","no-referrer").header("X-Robots-Tag","noindex, nofollow");
  });

  async function execute<T>(request: FastifyRequest, audience: string, resource: string | null, after?: string, command?: object) {
    if (!options.enabled) throw new ApiError(404,"NEED_PROJECT_LINKS_DISABLED","Community need associations unavailable");
    const { session, workspace, repo } = await needRequestContext(request,options,audience==="admin" || audience==="review");
    try {
      return await repo.rpc<T>("c14_links_for_api", {
        p_actor:session.actor, p_session:session.session, p_aal2:session.aal2, p_totp:session.totpAt ?? null,
        p_workspace:workspace, p_lane:audience, p_id:resource, p_after:after ?? null, p_command:command ?? null,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode,error.code,"Community need association unavailable");
      throw error;
    }
  }

  async function list(request: FastifyRequest, audience: string, resource: string | null, after?: string) {
    const { items, canRequest } = await execute<{ items: { id: string }[]; canRequest?: boolean }>(request,audience,resource,after);
    return { items:items.slice(0,20), nextCursor:items.length>20 ? items[19].id : null, canRequest };
  }
  app.get(root, (request) => {
    const input=lane.extend(cursor.shape).parse(request.query);
    return list(request,input.lane,null,input.after);
  });
  app.get(root+"/options", (request) => list(request,"options",null,cursor.parse(request.query).after));
  app.get(root+"/project/:id", (request) => list(request,"project",params.parse(request.params).id,cursor.parse(request.query).after));
  app.get(root+"/publication/:id", (request) => list(request,"publication",params.parse(request.params).id,cursor.parse(request.query).after));
  app.post(root,{bodyLimit:4096}, (request) => execute(request,"member",null,undefined,{...create.parse(request.body),action:"request"}));
  app.patch(root+"/:id",{bodyLimit:8192}, (request) =>
    execute(request,lane.parse(request.query).lane,params.parse(request.params).id,undefined,change.parse(request.body)));
}
