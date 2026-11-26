import { opportunityActivationStages, opportunityPauseScopes } from "@ayinou/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthVerifier } from "../services/auth.js";
import type { InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";
import { registerFounderActivation } from "./volunteer-activation.js";

const scopes = new Set<string>(opportunityPauseScopes);
const command = z.strictObject({
  capability: z.enum([...opportunityActivationStages, ...opportunityPauseScopes]),
  action: z.enum(["enable", "pause", "resume", "emergency_pause"]),
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestId: z.uuid(),
  confirmed: z.literal(true),
  configuration: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(500).refine(reason => !/\p{Cc}/u.test(reason)),
}).refine(input => scopes.has(input.capability) === (input.action === "emergency_pause"), "Invalid activation command");

export function registerOpportunityActivation(app: FastifyInstance, fixture: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  registerFounderActivation(app, fixture, auth, repository, budget, {
    path: "/api/v1/admin/opportunity-settings/activation", rpc: "c46_activation_for_api",
    unavailable: "Opportunity activation controls unavailable", readCategory: "profile", parse: body => command.parse(body),
  });
}
