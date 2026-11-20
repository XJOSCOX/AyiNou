import type { FastifyInstance, FastifyRequest } from "fastify";
import { impersonationKinds, personalClaims, verificationAppealOutcomes } from "@ayinou/shared";
import { z } from "zod";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const caseId = z.strictObject({ id: z.uuid() });
const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const publicUrl = z.string().trim().max(300).regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(\/[^\s?#\\]*)?$/)
  .refine((value) => URL.canParse(value));
const note = (maximum: number) => z.string().trim().min(10).max(maximum)
  .refine((value) => !/\p{Cc}/u.test(value.replace(/[\t\r\n]/g, "")));
const explanation = z.strictObject({
  explanation: note(1000), references: z.array(publicUrl).max(3).refine((value) => new Set(value).size === value.length),
});
const assign = z.strictObject({ reviewer: username, reason: note(500) });

export function registerTrustRoutes(app: FastifyInstance, context: {
  viewer(request: FastifyRequest, required: true): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const { viewer, repo, read } = context;
  const my = "/api/v1/me/verification/appeals";
  const operations = "/api/v1/trust";

  app.get(my, async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { appeals: await repo().rpc(token, "my_verification_appeals_for_client") };
  });
  app.post(my, { bodyLimit: 9_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = explanation.extend({ applicationId: z.uuid() }).parse(request.body);
    const id = await repo().rpc(token, "submit_verification_appeal_for_client", {
      p_application: input.applicationId, p_explanation: input.explanation, p_refs: input.references,
    });
    return reply.code(201).send({ id });
  });
  app.post("/api/v1/members/:username/impersonation-reports", { bodyLimit: 9_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const params = z.strictObject({ username }).parse(request.params);
    const input = explanation.extend({ kind: z.enum(impersonationKinds),
      institution: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/).nullable() }).parse(request.body);
    const id = await repo().rpc(token, "submit_impersonation_report_for_client", {
      p_handle: params.username, p_kind: input.kind, p_org: input.institution, p_explanation: input.explanation, p_refs: input.references,
    });
    return reply.code(201).send({ id });
  });
  app.get(operations + "/application-assignments", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { applications: await repo().rpc(token, "verification_assignment_queue_for_client") };
  });
  app.patch(operations + "/applications/:id/assignment", { bodyLimit: 4_096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = caseId.parse(request.params);
    const input = assign.extend({ assign: z.boolean() }).parse(request.body);
    await repo().rpc(token, "assign_verification_reviewer_for_client", {
      p_application: id, p_handle: input.reviewer, p_assign: input.assign, p_reason: input.reason,
    });
    return reply.code(204).send();
  });
  app.get(operations + "/verification-appeals", async (request) => {
    const { actor, token } = await viewer(request, true);
    const { view } = z.strictObject({ view: z.enum(["assign", "assigned"]) }).parse(request.query);
    await read("profile", actor, request.ip);
    return { appeals: await repo().rpc(token, "verification_appeals_queue_for_client", { p_view: view }) };
  });
  app.patch(operations + "/verification-appeals/:id/assignment", { bodyLimit: 4_096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = caseId.parse(request.params);
    const input = assign.parse(request.body);
    await repo().rpc(token, "assign_verification_appeal_for_client", { p_id: id, p_handle: input.reviewer, p_reason: input.reason });
    return reply.code(204).send();
  });
  app.patch(operations + "/verification-appeals/:id/decision", { bodyLimit: 6_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = caseId.parse(request.params);
    const input = z.strictObject({ outcome: z.enum(verificationAppealOutcomes), rationale: note(1000) }).parse(request.body);
    await repo().rpc(token, "decide_verification_appeal_for_client", { p_id: id, p_outcome: input.outcome, p_rationale: input.rationale });
    return reply.code(204).send();
  });
  app.get(operations + "/impersonation", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { reports: await repo().rpc(token, "impersonation_queue_for_client") };
  });
  app.patch(operations + "/impersonation/:id/decision", { bodyLimit: 6_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = caseId.parse(request.params);
    const input = z.strictObject({ outcome: z.enum(["dismissed", "substantiated"]), rationale: note(1000), hold: z.enum(personalClaims).nullable() }).parse(request.body);
    await repo().rpc(token, "decide_impersonation_report_for_client", {
      p_id: id, p_outcome: input.outcome, p_rationale: input.rationale, p_hold: input.hold,
    });
    return reply.code(204).send();
  });
}
