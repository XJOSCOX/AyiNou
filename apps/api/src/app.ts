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
import { registerPrivilegedSetup } from "./routes/privileged-setup.js";
import { registerSessionSecurity } from "./routes/session-security.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdministrationGovernance } from "./routes/administration-governance.js";
import { registerEarlyPartners } from "./routes/early-partners.js";
import { registerOrganizationOnboarding } from "./routes/organization-onboarding.js";
import { registerFounderIdentity } from "./routes/founder-identity.js";
import { registerPublicLegalRoutes } from "./routes/legal-publication.js";
import { registerErrorHandling, requestIdentification } from "./services/api-error.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { createFeedRepository, type FeedRepository } from "./services/feed.js";
import { createPostMediaService, type PostMediaService } from "./services/post-media.js";
import { createReadBudget } from "./services/read-budget.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { createPrivacyRepository, type PrivacyRepository } from "./services/privacy.js";
import { createPrivacyExport } from "./services/privacy-export.js";
import { registerPrivacyExportRoutes } from "./routes/privacy-export.js";
import { createPrivacyLifecycle } from "./services/privacy-lifecycle.js";
import { registerPrivacyLifecycleRoutes } from "./routes/privacy-lifecycle.js";

export function createApp(config: ApiConfig, overrides?: {
  auth?: AuthVerifier; members?: MemberRepository; community?: CommunityRepository; institutions?: InstitutionRepository; feed?: FeedRepository;
  media?: PostMediaService; privacy?: PrivacyRepository;
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
  const readBudget = createReadBudget(config);
  const privacyEnabled = config.AYINOU_PRIVACY_INTAKE === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";

  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "PATCH", "POST", "PUT", "DELETE"],
    exposedHeaders: ["X-Request-ID", "Retry-After"],
  });
  app.register(statusRoutes);
  app.register((instance) => registerMemberRoutes(instance, auth, members, readBudget));
  app.register((instance) => registerCommunityRoutes(instance, community));
  app.register((instance) => registerInstitutionRoutes(instance, auth, institutions));
  app.register((instance) => registerAdminRoutes(instance, auth, institutions, config.AYINOU_FOUNDER_BOOTSTRAP_ENABLED === "true"));
  app.register((instance) => registerPrivilegedSetup(instance, auth, institutions, config.AYINOU_FOUNDER_BOOTSTRAP_ENABLED === "true"));
  app.register((instance) => registerAdministrationGovernance(instance, auth, institutions));
  app.register((instance) => registerEarlyPartners(instance, auth, institutions));
  app.register((instance) => registerOrganizationOnboarding(instance, auth, institutions, readBudget));
  app.register((instance) => registerSessionSecurity(instance, auth, institutions));
  app.register((instance) => registerFounderIdentity(instance, auth, institutions));
  app.register((instance) => registerPublicLegalRoutes(instance, institutions));
  app.register((instance) => registerFeedRoutes(instance, auth, feed, media, readBudget));
  app.register((instance) => registerPrivacyRoutes(instance, privacyEnabled, auth,
    privacyEnabled ? overrides?.privacy ?? createPrivacyRepository(config) : null, readBudget));
  app.register((instance) => registerPrivacyExportRoutes(instance, createPrivacyExport(config, privacyEnabled), auth, readBudget));
  app.register((instance) => registerPrivacyLifecycleRoutes(instance, createPrivacyLifecycle(config, privacyEnabled), auth, readBudget));
  app.addHook("onClose", async () => { await members?.close(); });

  return app;
}
