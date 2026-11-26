import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget, ReadCategory } from "../services/read-budget.js";

const stages = z.enum(["intake", "requirements", "matching", "discovery", "recruitment", "all"]);
const command = z.strictObject({
  capability: stages, action: z.enum(["enable", "pause", "resume", "emergency_pause"]),
  expectedVersion: z.number().int().min(0).max(2147483646), requestId: z.uuid(), confirmed: z.literal(true),
  configuration: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(500).refine(reason => !/\p{Cc}/u.test(reason)),
}).refine(input => (input.capability === "all") === (input.action === "emergency_pause"), "Invalid activation command");

export function registerVolunteerActivation(app: FastifyInstance, fixture: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  registerFounderActivation(app, fixture, auth, repository, budget, {
    path: "/api/v1/admin/volunteer-settings/activation", rpc: "c35_activation_for_api",
    unavailable: "Volunteer controls unavailable", parse: body => command.parse(body),
  });
}

export function registerFounderActivation(app: FastifyInstance, fixture: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget, route: {
    path: string; rpc: string; unavailable: string; readCategory?: ReadCategory; parse: (body: unknown) => { action: string };
  }) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow").header("Referrer-Policy", "no-referrer");
  });
  async function run(request: FastifyRequest, action: "read" | "change", input: object = {}) {
    z.strictObject({}).parse(request.query);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", route.unavailable);
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(route.readCategory ?? "audit", session.actor, request.ip);
    try {
      const access = await repository.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
      if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      return await repository.rpc(route.rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, p_fixture: fixture, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, route.unavailable);
      throw error;
    }
  }
  app.get(route.path, request => run(request, "read"));
  app.patch(route.path, { bodyLimit: 4096 }, request => {
    const { action, ...input } = route.parse(request.body);
    return run(request, "change", { ...input, command: action });
  });
}
