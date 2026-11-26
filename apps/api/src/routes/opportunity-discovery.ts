
import {
  locales, professionalOpportunityCategories, professionalOpportunityModes, professionalOpportunityScopes,
  professionalOpportunityTypes, volunteerDepartments, volunteerLevels,
} from "@ayinou/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum)
  .refine(value => !/\p{Cc}/u.test(value.replaceAll("\n", "")));
const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;
const types = z.enum(professionalOpportunityTypes);
const modes = z.enum(professionalOpportunityModes);
const skillCode = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/);
const country = z.string().regex(/^[A-Z]{2}$/);
const period = z.enum(["hour","day","week","month","year","project"]);
const receipt = { requestId: z.uuid(), expectedVersion: integer(0, 2147483646) };
const empty = z.strictObject({});
const query = z.strictObject({
  view: z.enum(["latest","forYou","saved"]).optional(), sort: z.enum(["latest","closing","relevance"]).optional(),
  cursor: z.string().max(1450).regex(/^[a-f0-9]+\.[a-f0-9]{64}$/).optional(),
  keyword: text(2,80).optional(), type: types.optional(), category: z.enum(professionalOpportunityCategories).optional(),
  country: country.optional(), department: z.enum(volunteerDepartments).optional(), mode: modes.optional(),
  skill: skillCode.optional(), language: z.enum(locales).optional(), deadline: z.iso.date().optional(),
  employmentType: z.enum(["full_time","part_time","temporary","contract","seasonal"]).optional(),
  payment: z.enum(["paid","unpaid","free"]).optional(), funding: z.enum(["full","partial"]).optional(),
});
const preferences = z.strictObject({
  types:z.array(types).max(7).refine(unique),
  interests:z.array(z.enum(professionalOpportunityCategories)).max(2).refine(unique),
  skills:z.array(z.strictObject({code:skillCode,proficiency:z.enum(volunteerLevels)})).max(12).refine(items=>unique(items.map(item=>item.code))),
  experience:integer(0,60).nullable(),
  countries:z.array(country).max(12).refine(unique), departments:z.array(z.enum(volunteerDepartments)).max(10).refine(unique),
  modes:z.array(modes).max(3).refine(unique), languages:z.array(z.enum(locales)).max(4).refine(unique),
  objectives:text(0,500),
  compensation:z.strictObject({currency:z.string().regex(/^[A-Z]{3}$/),
    period,minimum:integer(1,99999999)}).nullable(),
});
const command = z.discriminatedUnion("action",[
  z.strictObject({...receipt,action:z.literal("save_preferences"),preferences,expiresOn:z.iso.date().nullable(),
    import:z.strictObject({source:z.enum(["volunteer","mentor","mentee"]),version:integer(1,2147483646),
      codes:z.array(skillCode).min(1).max(12).refine(unique),confirmed:z.literal(true)}).optional()}),
  z.strictObject({...receipt,action:z.enum(["opt_in","pause","resume","withdraw","clear","reset"]),confirmed:z.literal(true)}),
  z.strictObject({...receipt,action:z.enum(["save","dismiss"]),id:z.uuid(),revision:integer(1,2147483646)}),
  z.strictObject({...receipt,action:z.literal("unsave"),id:z.uuid()}),
]);
const dimensions = ["keyword","type","category","country","department","mode","skill","language","deadline","employmentType","payment","funding"] as const;
const criteria = ["type","interest","skill","language","location","mode","experience","compensation"] as const;
const fields = ["types","interests","skills","experience","countries","departments","modes","languages","objectives","compensation"] as const;
const prepare = z.strictObject({...receipt,confirmed:z.literal(true),reason:text(10,500),configuration:z.strictObject({
  types:z.array(types).max(7).refine(unique),scopes:z.array(z.enum(professionalOpportunityScopes)).max(2).refine(unique),
  dimensions:z.array(z.enum(dimensions)).max(dimensions.length).refine(unique),
  criteria:z.array(z.enum(criteria)).max(criteria.length).refine(unique),fields:z.array(z.enum(fields)).max(fields.length).refine(unique),
  pageLimit:integer(4,24),recommendationLimit:integer(4,20),savedLimit:integer(10,200),dismissDays:integer(7,60),
  readinessNotes:text(0,500),
})});

export function registerOpportunityDiscovery(app: FastifyInstance, fixture: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest",async (_request,reply)=>{
    reply.header("Cache-Control","private, no-store").header("Referrer-Policy","no-referrer").header("X-Robots-Tag","noindex, nofollow");
  });
  async function run(req: FastifyRequest, action:string, input:object, founder=false) {
    const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    if (!repository || !auth?.verifySession) throw new ApiError(503,"SERVICE_UNAVAILABLE","Opportunity discovery unavailable");
    const session=await auth.verifySession(token,founder);
    if (!session) {
      if (founder && await auth.verifySession(token)) throw new ApiError(403,"MFA_REQUIRED","Recent verification required");
      throw new ApiError(401,"UNAUTHORIZED","Sign in required");
    }
    const workspace=founder ? z.uuid().safeParse(req.headers["x-ayinou-workspace"]) : null;
    if (workspace && !workspace.success) throw new ApiError(403,"FORBIDDEN","Private workspace required");
    await budget(founder?"audit":"profile",session.actor,req.ip);
    try {
      return await repository.rpc("c45_discovery_for_api",{
        p_actor:session.actor,p_session:session.session,p_aal2:session.aal2,p_totp:session.totpAt ?? null,
        p_workspace:workspace?.data ?? null,p_fixture:fixture,p_action:action,p_input:input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode,error.code,"Opportunity discovery unavailable");
      throw error;
    }
  }
  const page="/api/v1/me/opportunity-discovery";
  app.get(page,req=>run(req,"list",query.parse(req.query)));
  app.get(page+"/preferences",req=>run(req,"preferences",empty.parse(req.query)));
  app.get(page+"/import",req=>run(req,"import",empty.parse(req.query)));
  app.get(page+"/skills",req=>run(req,"catalog",z.strictObject({q:text(0,80).default("")}).parse(req.query)));
  app.patch(page,{bodyLimit:6000},req=>{
    empty.parse(req.query);
    const {action,...input}=command.parse(req.body);
    return run(req,action,input);
  });
  const settings="/api/v1/admin/opportunity-settings/discovery";
  app.get(settings,req=>run(req,"settings",empty.parse(req.query),true));
  app.patch(settings,{bodyLimit:3200},req=>{
    empty.parse(req.query);
    return run(req,"configure",prepare.parse(req.body),true);
  });
}
