import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiErrorResponse, UpdateMemberProfile } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import type { MemberRepository } from "../services/members.js";

declare module "fastify" {
  interface FastifyRequest { authUserId: string | null }
}

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  preferredLocale: z.enum(["ht", "fr", "en"]),
  residenceCountryCode: z.union([z.string().regex(/^[A-Z]{2}$/), z.null()]),
  residenceDepartmentCode: z.union([z.string().regex(/^HT-[A-Z]{2}$/), z.null()]),
  diasporaDepartmentCode: z.union([z.string().regex(/^HT-[A-Z]{2}$/), z.null()]),
}).strict().refine((value) =>
  (value.residenceDepartmentCode === null || value.residenceCountryCode === "HT") &&
  (value.diasporaDepartmentCode === null || value.residenceCountryCode !== "HT"),
);

function error(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

export async function registerMemberRoutes(
  app: FastifyInstance,
  auth: AuthVerifier | null,
  members: MemberRepository | null,
): Promise<void> {
  app.get("/api/v1/departments", async (_request, reply) => {
    if (!members) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Database unavailable"));
    return { departments: await members.departments() };
  });

  app.register(async (protectedApp) => {
    protectedApp.decorateRequest("authUserId", null);
    protectedApp.addHook("preHandler", async (request: FastifyRequest, reply) => {
      if (!auth || !members) {
        return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      }
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "");
      if (!match) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      const userId = await auth.verify(match[1]);
      if (!userId) return reply.code(401).send(error("UNAUTHORIZED", "Invalid or expired session"));
      request.authUserId = userId;
    });

    protectedApp.get("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      return { profile: await members.get(request.authUserId) };
    });

    protectedApp.patch("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(error("INVALID_PROFILE", "Profile details are invalid"));
      return { profile: await members.update(request.authUserId, parsed.data as UpdateMemberProfile) };
    });
  });
}
