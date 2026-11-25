import type { FastifyInstance, FastifyRequest } from "fastify";
import { matchingCriteria, volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { createPrivateCursor } from "../services/private-cursor.js";
import type { ReadBudget } from "../services/read-budget.js";

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const receipt = { expectedVersion: integer(0,2147483646), requestId: z.uuid() };
const configure = z.strictObject({ ...receipt, action:z.literal("configure"), confirmed: z.literal(true),
  reason: z.string().trim().min(10).max(500).refine((text) => !/\p{Cc}/u.test(text)),
  criteria: z.array(z.enum(matchingCriteria)).max(matchingCriteria.length),
  departments: z.array(z.enum(volunteerDepartments)).max(volunteerDepartments.length),
  modes: z.array(z.enum(volunteerModes)).max(volunteerModes.length),
  requiredWeight: integer(3,9), preferredWeight: integer(1,2), recommendationLimit: integer(1,16), discoveryLimit: integer(1,8),
});
const preference = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("pause") }),
  z.strictObject({ ...receipt, action: z.literal("resume") }),
]);
const cursorField = z.string().regex(/^[A-Za-z0-9_-]{1,384}$/).optional();
const query = z.strictObject({ cursor:cursorField, department:z.enum(volunteerDepartments).optional(),
  mode:z.enum(volunteerModes).optional(), skill:z.string().regex(/^[a-z][a-z0-9_]{2,39}$/).optional(),
  weekly:z.enum(["true","false"]).optional() });
const scope = z.strictObject({ id:z.uuid(), opportunity:z.uuid() });
const noQuery = z.strictObject({});
const cursorShape = z.strictObject({ expires:z.number().int(), id:z.uuid(), revision:integer(1,100).nullable(), pages:integer(1,500) });

type DatabasePage = { state: "closed" | "unavailable" | "ready"; items: unknown[]; nextKey: string | null;
  requirementVersion?: number; pauseVersion?: number; paused?: boolean; hasProfile?: boolean };

export function registerVolunteerMatching(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget, secret?: string) {
  const cursors = secret ? createPrivateCursor(secret,"ayinou-volunteer-matching-v1",cursorShape,"Invalid matching cursor") : null;
  app.addHook("onRequest", async (_request,reply) => {
    reply.header("Cache-Control","private, no-store").header("X-Robots-Tag","noindex, nofollow").header("Referrer-Policy","no-referrer");
  });

  async function run(request: FastifyRequest, action: string, input = {}, project?: string, opportunity?: string, cursor?: string) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503,"SERVICE_UNAVAILABLE","Volunteer matching unavailable");
    const staff = action==="settings" || action==="configure";
    const readPage = action==="recommend" || action==="discover";
    const session = await auth.verifySession(token,staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403,"MFA_REQUIRED","Recent verification required");
      throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    }
    if (!staff && !enabled) {
      if (readPage) return { state:"closed",items:[],nextCursor:null };
      throw new ApiError(403,"FORBIDDEN","Volunteer matching unavailable");
    }
    const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success===false) throw new ApiError(403,"FORBIDDEN","Private workspace required");
    if (readPage && !cursors) throw new ApiError(503,"SERVICE_UNAVAILABLE","Volunteer matching unavailable");
    const binding = [session.actor,session.session,action,project,opportunity,input] as const;
    const previous = cursor ? cursors!.open(cursor,binding) : null;
    await budget(staff ? "audit" : action==="discover" ? "discovery" : "profile",session.actor,request.ip);
    try {
      if (staff) {
        const access = await repository.rpc<{ founder?:boolean; administrator?:boolean }>("platform_access_for_api",{ p_actor:session.actor });
        if (access?.founder!==true || access.administrator!==true) throw new ApiError(403,"FORBIDDEN","Founder authority required");
      }
      const result = await repository.rpc<DatabasePage>("c33_matching_for_api",{
        p_actor:session.actor,p_session:session.session,p_aal2:session.aal2,p_totp:session.totpAt??null,
        p_workspace:workspace?.data??null,p_fixture:enabled,p_project:project??null,p_opportunity:opportunity??null,
        p_after:previous?.id??null,p_action:action,p_input:previous?.revision ? { ...input, revision:previous.revision } : input,
      });
      if (!readPage) return result;
      const { nextKey, requirementVersion, ...page } = result;
      const pages = (previous?.pages??0)+1;
      const nextCursor = nextKey && pages<(action==="discover" ? 3 : 500) ? cursors!.seal({
        id:nextKey,revision:requirementVersion??null,expires:Date.now()+5*60_000,pages,
      },binding) : null;
      return { ...page,nextCursor };
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode,error.code,"Volunteer matching unavailable");
      throw error;
    }
  }

  const owner = "/api/v1/me/volunteer-matches", admin = "/api/v1/admin/volunteer-settings/matching";
  const project = "/api/v1/projects/:id/work/requirements/:opportunity";
  app.get(owner,(request) => {
    const { cursor, ...filters } = query.parse(request.query);
    return run(request,"recommend",filters,undefined,undefined,cursor);
  });
  app.patch(owner,{ bodyLimit:512 },(request) => {
    noQuery.parse(request.query);
    const { action, ...body } = preference.parse(request.body);
    return run(request,action,body);
  });
  app.post(project + "/dismiss",{ bodyLimit:512 },(request) => {
    noQuery.parse(request.query);
    const { id, opportunity } = scope.parse(request.params);
    return run(request,"dismiss",z.strictObject({ revision:integer(1,100) }).parse(request.body),id,opportunity);
  });
  app.get(project + "/candidates",(request) => {
    const { id, opportunity } = scope.parse(request.params);
    const { cursor } = z.strictObject({ cursor:cursorField }).parse(request.query);
    return run(request,"discover",{},id,opportunity,cursor);
  });
  app.get(admin,(request) => { noQuery.parse(request.query); return run(request,"settings"); });
  app.patch(admin,{ bodyLimit:4096 },(request) => {
    noQuery.parse(request.query);
    const { action,...body } = configure.parse(request.body);
    return run(request,action,body);
  });
}
