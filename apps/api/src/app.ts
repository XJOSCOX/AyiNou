import Fastify from "fastify";
import cors from "@fastify/cors";
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
import { registerErrorHandling, requestIdentification } from "./services/api-error.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { createFeedRepository, type FeedRepository } from "./services/feed.js";
import { createPostMediaService, type PostMediaService } from "./services/post-media.js";

export function createApp(config: ApiConfig, overrides?: {
  auth?: AuthVerifier; members?: MemberRepository; community?: CommunityRepository; institutions?: InstitutionRepository; feed?: FeedRepository;
  media?: PostMediaService;
}) {
  const app = Fastify({
    ...requestIdentification(),
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie"],
    },
  });
  registerErrorHandling(app);
  const auth = overrides?.auth ?? createAuthVerifier(config);
  const members = overrides?.members ?? createMemberRepository(config);
  const community = overrides?.community ?? createCommunityRepository(config);
  const institutions = overrides?.institutions ?? createInstitutionRepository(config);
  const feed = overrides?.feed ?? createFeedRepository(config);
  const media = overrides?.media ?? createPostMediaService(config);

  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "PATCH", "POST", "PUT", "DELETE"],
    exposedHeaders: ["X-Request-ID", "Retry-After"],
  });
  app.register(statusRoutes);
  app.register((instance) => registerMemberRoutes(instance, auth, members));
  app.register((instance) => registerCommunityRoutes(instance, community));
  app.register((instance) => registerInstitutionRoutes(instance, auth, institutions));
  app.register((instance) => registerAdminRoutes(instance, auth, institutions));
  app.register((instance) => registerFeedRoutes(instance, auth, feed, media));
  app.addHook("onClose", async () => { await members?.close(); });

  return app;
}
