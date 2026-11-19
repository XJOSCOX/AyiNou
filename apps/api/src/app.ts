import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { ApiErrorResponse } from "@ayinou/shared";
import type { ApiConfig } from "./config.js";
import { statusRoutes } from "./routes/status.js";
import { registerMemberRoutes } from "./routes/members.js";
import { createAuthVerifier, type AuthVerifier } from "./services/auth.js";
import { createMemberRepository, type MemberRepository } from "./services/members.js";
import { createCommunityRepository, type CommunityRepository } from "./services/community.js";
import { registerCommunityRoutes } from "./routes/community.js";
import { registerInstitutionRoutes } from "./routes/institutions.js";
import { createInstitutionRepository, type InstitutionRepository } from "./services/institutions.js";
import { registerAdminRoutes } from "./routes/admin.js";

export function createApp(config: ApiConfig, overrides?: {
  auth?: AuthVerifier; members?: MemberRepository; community?: CommunityRepository; institutions?: InstitutionRepository;
}) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie"],
    },
  });
  const auth = overrides?.auth ?? createAuthVerifier(config);
  const members = overrides?.members ?? createMemberRepository(config);
  const community = overrides?.community ?? createCommunityRepository(config);
  const institutions = overrides?.institutions ?? createInstitutionRepository(config);

  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "PATCH", "POST"],
  });
  app.register(statusRoutes);
  app.register((instance) => registerMemberRoutes(instance, auth, members));
  app.register((instance) => registerCommunityRoutes(instance, community));
  app.register((instance) => registerInstitutionRoutes(instance, auth, institutions));
  app.register((instance) => registerAdminRoutes(instance, auth, institutions));
  app.addHook("onClose", async () => { await members?.close(); });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiErrorResponse = { error: { code: "NOT_FOUND", message: "Route not found" } };
    reply.code(404).send(body);
  });
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ code: error.code }, "Request failed");
    const status = ["23503", "23514", "22001"].includes(error.code ?? "") ? 400 :
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const body: ApiErrorResponse = {
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
        message: status === 500 ? "An unexpected error occurred" : "Request could not be processed",
      },
    };
    reply.code(status).send(body);
  });

  return app;
}
