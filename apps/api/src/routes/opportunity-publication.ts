import { opportunityReportReasons, opportunityReviewChecks, professionalOpportunityTypes, volunteerDepartments } from "@ayinou/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const id = z.uuid();
const version = z.number().int().min(0).max(2147483646);
const shortText = z.string().trim().min(1).max(500).refine(value => !/\p{Cc}/u.test(value));
const reason = shortText.refine(value => value.length >= 10);
const method = z.enum(["external","expression_of_interest","event_registration"]);
const founderActions = new Set(["settings","configure","appoint","revoke","assign","release","admin_queue","reports"]);
const reviewerActions = new Set(["review_queue","review_reports","decide","recuse","restrict"]);
const scoped = z.strictObject({ organization: id });
const resource = z.strictObject({ organization: id, opportunity: id });
const paging = { after: id.optional() };
const read = z.discriminatedUnion("action", [
  z.strictObject({ action:z.enum(["settings"]) }),
  z.strictObject({ action:z.enum(["admin_queue","review_queue","my_interest"]), ...paging }),
  z.strictObject({ action:z.enum(["reports","review_reports"]), before:z.coerce.number().int().positive().optional() }),
  resource.extend({ action:z.enum(["organization_case","organization_interest","interest_preview"]), ...paging }),
]);
const receipt = {requestId:id};
const revised = {...receipt,version};
const confirm = {...revised,confirmed:z.literal(true)};
const noted = {...confirm,reason};
const configured = z.strictObject({
  types:z.array(z.enum(professionalOpportunityTypes)).min(1).max(7),
  methods:z.array(method).min(1).max(3),
  submissionsPerDay:z.number().int().min(1).max(20),
  interestPerDay:z.number().int().min(1).max(10),
  reportsPerDay:z.number().int().min(1).max(8),
  staffingPlan:z.string().trim().max(500).refine(value=>!/\p{Cc}/u.test(value)).optional(),
  readinessNotes:z.string().trim().max(500).refine(value=>!/\p{Cc}/u.test(value)).optional(),
});
const command = z.discriminatedUnion("action",[
  z.strictObject({action:z.literal("configure"),...noted,settings:configured}),
  z.strictObject({action:z.literal("appoint"),...receipt,confirmed:z.literal(true),reason,
    reviewer:id,country:z.string().regex(/^[A-Z]{2}$/),department:z.enum(volunteerDepartments).nullable(),expiresAt:z.iso.datetime()}),
  z.strictObject({action:z.literal("revoke"),...receipt,confirmed:z.literal(true),reason,grant:id}),
  z.strictObject({action:z.literal("assign"),opportunity:id,...noted,grant:id}),
  z.strictObject({action:z.literal("release"),opportunity:id,...noted}),
  resource.extend({action:z.literal("submit"),...confirm,ownership:shortText.optional()}),
  z.strictObject({action:z.literal("decide"),opportunity:id,...noted,decision:z.enum(["approved","changes_requested","rejected"]),
    checks:z.array(z.enum(opportunityReviewChecks)).max(8).optional()}),
  z.strictObject({action:z.literal("recuse"),opportunity:id,...revised,reason}),
  z.strictObject({action:z.literal("restrict"),opportunity:id,...noted,grant:id}),
  resource.extend({action:z.literal("challenge"),...noted}),
  resource.extend({action:z.enum(["publish","close","withdraw","expire","archive"]),...confirm}),
  resource.extend({action:z.literal("destination"),version,confirmed:z.literal(true)}),
  resource.extend({action:z.literal("express"),...revised,statement:shortText,
    identity:z.strictObject({username:z.string().min(1).max(64),displayName:z.string().min(1).max(128)}),
    consent:z.literal(true),adult:z.literal(true)}),
  resource.extend({action:z.literal("interest_state"),...revised,interest:id,state:z.enum(["acknowledged","follow_up","closed"])}),
  z.strictObject({action:z.literal("interest_withdraw"),...revised,interest:id}),
  resource.extend({action:z.literal("report"),...revised,reason,category:z.enum(opportunityReportReasons)}),
]);

export function registerOpportunityPublication(app: FastifyInstance, fixture: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control","private, no-store").header("Referrer-Policy","no-referrer").header("X-Robots-Tag","noindex, nofollow");
  });
  async function run(req: FastifyRequest, values: {action:string;organization?:string;opportunity?:string}) {
    const {action,organization,opportunity,...input}=values;
    const staff=founderActions.has(action) || reviewerActions.has(action);
    const publicRead=action==="public_list" || action==="public_detail";
    const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token && !publicRead) throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    if (!repository || (token && !auth?.verifySession)) throw new ApiError(503,"SERVICE_UNAVAILABLE","Opportunity service unavailable");
    const session=token ? await auth?.verifySession?.(token,staff) : undefined;
    if (token && !session) {
      if (staff && await auth?.verifySession?.(token)) throw new ApiError(403,"MFA_REQUIRED","Recent verification required");
      throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    }
    const workspace=staff ? id.safeParse(req.headers["x-ayinou-workspace"]) : null;
    if (workspace && !workspace.success) throw new ApiError(403,"FORBIDDEN","Private workspace required");
    await budget(staff ? "audit" : "profile",session?.actor ?? null,req.ip);
    try {
      return await repository.rpc("c42_opportunities_for_api",{
        p_actor:session?.actor ?? null,p_session:session?.session ?? null,p_aal2:session?.aal2 ?? false,p_totp:session?.totpAt ?? null,
        p_workspace:workspace?.data ?? null,p_fixture:fixture,p_org:organization ?? null,p_opportunity:opportunity ?? null,
        p_action:action,p_input:input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode,error.code,"Opportunity operation unavailable");
      throw error;
    }
  }
  const base="/api/v1/opportunity-publication";
  app.get(base+"/public/:organization", request => {
    const identifiers=scoped.parse(request.params);
    const input=z.strictObject({ opportunity:id.optional(), ...paging }).parse(request.query);
    return run(request,{action:input.opportunity?"public_detail":"public_list",...identifiers,...input});
  });
  app.get(base+"/workspace",request=>run(request,read.parse(request.query)));
  app.post(base+"/workspace",{bodyLimit:4096},request=>{
    z.strictObject({}).parse(request.query);
    return run(request,command.parse(request.body));
  });
}
