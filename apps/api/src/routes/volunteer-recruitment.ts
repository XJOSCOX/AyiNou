import type { FastifyInstance, FastifyRequest } from "fastify";
import { projectReportCategories, volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { createPrivateCursor } from "../services/private-cursor.js";
import { createRecruitmentSelection, selectionValue } from "../services/recruitment-selection.js";
import type { ReadBudget } from "../services/read-budget.js";

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const receipt = { expectedVersion: integer(0, 2147483646), requestId: z.uuid() };
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/\p{Cc}/u.test(value));
const mutation = z.strictObject(receipt);
const configure = z.strictObject({ ...receipt, action: z.literal("configure"), confirmed: z.literal(true), reason: boundedText(10, 500),
  modes: z.array(z.enum(volunteerModes)).max(3), departments: z.array(z.enum(volunteerDepartments)).max(10),
  expiryDays: integer(1, 14), organizerDailyLimit: integer(1, 10), opportunityDailyLimit: integer(1, 15),
  recipientDailyLimit: integer(1, 3), cooldownDays: integer(7, 30),
});
const opportunity = z.strictObject({ project: z.uuid(), opportunity: z.uuid() });
const invitation = z.strictObject({ invitation: z.uuid() });
const pagination = z.strictObject({ cursor: z.string().regex(/^[A-Za-z0-9_-]{1,384}$/).optional() });
const empty = z.strictObject({});
const cursorShape = z.strictObject({ id: z.uuid(), expires: z.number().int() });

type Scope = { project?: string; opportunity?: string; invitation?: string };
type Result = { nextKey?: string | null; [key: string]: unknown };
type Action = "settings" | "configure" | "preferences" | "contact" | "inbox" | "sent" | "preview" | "send" | "open" | "decline" | "withdraw" | "dismiss" | "report";

export function registerVolunteerRecruitment(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget, secret?: string) {
  const selections = secret ? createRecruitmentSelection(secret) : null;
  const cursors = secret ? createPrivateCursor(secret, "ayinou-recruitment-v1", cursorShape, "Invalid invitation cursor") : null;
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow").header("Referrer-Policy", "no-referrer");
  });

  async function run(request: FastifyRequest, action: Action, scope: Scope = {}, input: object = {}, cursor?: string, selection?: string) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Recruitment unavailable");
    const staff = action === "settings" || action === "configure";
    const readPage = action === "inbox" || action === "sent";
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    if (!staff && !enabled) {
      if (readPage || action === "preferences" || action === "open") return { state: "closed", items: [], nextCursor: null };
      throw new ApiError(403, "FORBIDDEN", "Recruitment unavailable");
    }
    const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    if (readPage && !cursors) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Recruitment unavailable");
    const binding = [session.actor, session.session, action, scope.project, scope.opportunity];
    const previous = cursor ? cursors!.open(cursor, binding) : null;
    const candidate = selection && selections ? selections.open(selection, [session.actor, session.session, scope.project, scope.opportunity]) : null;
    if (selection && !candidate) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Recruitment unavailable");
    const body = candidate ? { ...input, handle: candidate.handle, revision: candidate.revision } : input;
    await budget(staff ? "audit" : action === "preview" || action === "send" ? "discovery" : "notifications", session.actor, request.ip);
    try {
      if (staff) {
        const access = await repository.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      const result = await repository.rpc<Result>("c34_recruitment_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace?.data ?? null, p_fixture: enabled, p_project: scope.project ?? null, p_opportunity: scope.opportunity ?? null,
        p_invitation: scope.invitation ?? null, p_action: action, p_input: body, p_after: previous?.id ?? null,
      });
      if (!readPage) return result;
      const { nextKey, ...page } = result;
      return { ...page, nextCursor: nextKey ? cursors!.seal({ id: nextKey, expires: Date.now() + 5 * 60_000 }, binding) : null };
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Recruitment unavailable");
      throw error;
    }
  }

  const owner = "/api/v1/me/volunteer-recruitment";
  const admin = "/api/v1/admin/volunteer-settings/recruitment";
  const scope = "/api/v1/projects/:project/work/requirements/:opportunity/recruitment";
  app.get(owner, (request) => run(request, "inbox", {}, {}, pagination.parse(request.query).cursor));
  app.get(owner + "/preferences", (request) => { empty.parse(request.query); return run(request, "preferences"); });
  app.patch(owner + "/preferences", { bodyLimit: 512 }, (request) => {
    empty.parse(request.query);
    return run(request, "contact", {}, z.strictObject({ ...receipt, allowed: z.boolean() }).parse(request.body));
  });
  app.get(owner + "/:invitation", (request) => {
    empty.parse(request.query);
    return run(request, "open", invitation.parse(request.params));
  });
  app.patch(owner + "/:invitation", { bodyLimit: 4096 }, (request) => {
    empty.parse(request.query);
    const { action, ...body } = z.union([
      mutation.extend({ action: z.enum(["decline", "withdraw", "dismiss"]) }),
      mutation.extend({ action: z.literal("report"), category: z.enum(projectReportCategories), explanation: boundedText(10, 500) }),
    ]).parse(request.body);
    return run(request, action, invitation.parse(request.params), body);
  });
  app.get(scope, (request) => run(request, "sent", opportunity.parse(request.params), {}, pagination.parse(request.query).cursor));
  app.post(scope + "/preview", { bodyLimit: 256 }, (request) => {
    empty.parse(request.query);
    const { selection } = z.strictObject({ selection: selectionValue }).parse(request.body);
    return run(request, "preview", opportunity.parse(request.params), {}, undefined, selection);
  });
  app.post(scope, { bodyLimit: 2048 }, (request) => {
    empty.parse(request.query);
    const { selection, ...body } = z.strictObject({
      ...receipt, expectedVersion: z.literal(0), selection: selectionValue, message: boundedText(1, 400),
    }).parse(request.body);
    return run(request, "send", opportunity.parse(request.params), body, undefined, selection);
  });
  app.get(admin, (request) => { empty.parse(request.query); return run(request, "settings"); });
  app.patch(admin, { bodyLimit: 4096 }, (request) => {
    empty.parse(request.query);
    const { action, ...body } = configure.parse(request.body);
    return run(request, action, {}, body);
  });
}
