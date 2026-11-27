import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ApiConfig } from "./config.js";
import { statusRoutes } from "./routes/status.js";
import { registerMemberRoutes } from "./routes/members.js";
import { createAuthVerifier, type AuthVerifier } from "./services/auth.js";
import { createMemberRepository, type MemberRepository } from "./services/members.js";
import { createCommunityRepository, type CommunityRepository } from "./services/community.js";
import { registerNeedProjectLinks } from "./routes/need-project-links.js";
import { registerCommunityNeedPublication } from "./routes/community-need-publication.js";
import { registerCommunityNeedsReview } from "./routes/community-needs-review.js";
import { registerCommunityNeedsPilot } from "./routes/community-needs-pilot.js";
import { registerOpportunityRequirements } from "./routes/opportunity-requirements.js";
import { registerMentorship } from "./routes/mentorship.js";
import { registerOpportunityActivation } from "./routes/opportunity-activation.js";
import { registerOpportunityDiscovery } from "./routes/opportunity-discovery.js";
import { registerOpportunityPublication } from "./routes/opportunity-publication.js";
import { registerProfessionalOpportunities } from "./routes/professional-opportunities.js";
import { registerVolunteerActivation } from "./routes/volunteer-activation.js";
import { registerVolunteerRecruitment } from "./routes/volunteer-recruitment.js";
import { registerVolunteerMatching } from "./routes/volunteer-matching.js";
import { registerVolunteering } from "./routes/volunteering.js";
import { registerImpact } from "./routes/impact.js";
import { registerProjectOutcomePublication } from "./routes/project-outcome-publication.js";
import { registerProjectOutcomeReview } from "./routes/project-outcome-review.js";
import { registerProjectOutcomes } from "./routes/project-outcomes.js";
import { registerCommunityNeeds } from "./routes/community-needs.js";
import { registerCommunityRoutes } from "./routes/community.js";
import { registerInstitutionRoutes } from "./routes/institutions.js";
import { createInstitutionRepository, type InstitutionRepository } from "./services/institutions.js";
import { registerPrivilegedSetup } from "./routes/privileged-setup.js";
import { registerSessionSecurity } from "./routes/session-security.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerEnforcementAppeals } from "./routes/enforcement-appeals.js";
import { registerFeatureEnforcement } from "./routes/feature-enforcement.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdministrationGovernance } from "./routes/administration-governance.js";
import { registerEarlyPartners } from "./routes/early-partners.js";
import { registerOrganizationOnboarding } from "./routes/organization-onboarding.js";
import { registerFounderIdentity } from "./routes/founder-identity.js";
import { registerModerationPolicyRoutes } from "./routes/moderation-policy.js";
import { registerRegistrationPolicyRoutes } from "./routes/registration-policy.js";
import { registerVerificationPolicy } from "./routes/verification-policy.js";
import { registerMemberExperiencePolicy } from "./routes/member-experience-policy.js";
import { registerHomepagePolicyRoutes } from "./routes/homepage-policy.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPublicLegalRoutes } from "./routes/legal-publication.js";
import { ApiError, registerErrorHandling, requestIdentification } from "./services/api-error.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { createFeedRepository, type FeedRepository } from "./services/feed.js";
import { createPostMediaService, type PostMediaService } from "./services/post-media.js";
import { registerRenderDevelopment } from "./services/render-development.js";
import { createReadBudget, type ReadBudget } from "./services/read-budget.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { createPrivacyRepository, type PrivacyRepository } from "./services/privacy.js";
import { createPrivacyExport } from "./services/privacy-export.js";
import { registerPrivacyExportRoutes } from "./routes/privacy-export.js";
import { createPrivacyLifecycle } from "./services/privacy-lifecycle.js";
import { registerPrivacyLifecycleRoutes } from "./routes/privacy-lifecycle.js";

export function createApp(config: ApiConfig, overrides?: {
  auth?: AuthVerifier; members?: MemberRepository; community?: CommunityRepository; institutions?: InstitutionRepository; feed?: FeedRepository;
  media?: PostMediaService; privacy?: PrivacyRepository; readBudget?: ReadBudget;
}) {
  const render = config.renderDevelopment;
  const app = Fastify({
    ...(render ? {
      bodyLimit: 16_384, connectionTimeout: 20_000, requestTimeout: 10_000,
      handlerTimeout: 18_000, maxRequestsPerSocket: 100,
    } : {}),
    ...requestIdentification(),
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie"],
    },
  });
  registerErrorHandling(app, Boolean(render));
  const auth = overrides?.auth ?? createAuthVerifier(config);
  const members = overrides?.members ?? createMemberRepository(config);
  const community = overrides?.community ?? createCommunityRepository(config);
  const institutions = overrides?.institutions ?? createInstitutionRepository(config);
  const feed = overrides?.feed ?? createFeedRepository(config);
  const media = overrides?.media ?? createPostMediaService(config);
  const readBudget = overrides?.readBudget ?? createReadBudget(config);
  const privacyEnabled = config.AYINOU_PRIVACY_INTAKE === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";

  if (render) registerRenderDevelopment(app, auth, institutions, render);
  else app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "PATCH", "POST", "PUT", "DELETE"],
    exposedHeaders: ["X-Request-ID", "Retry-After"],
  });
  app.addHook("preHandler", async (request) => {
    if (!auth?.memberFeatureAccess || !/^\/api\/v1\/(?:feed|posts|comments|groups|communities|projects|polls|discover|notifications|me\/(?:following|notifications|communities|community-activity|community-invitations|community-recommendation-settings|project-work|projects|polls))(?:[/?]|$)/.test(request.url)) return;
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (token && await auth.memberFeatureAccess(token) === false) {
      throw new ApiError(403, "ONBOARDING_REQUIRED", "Complete member onboarding first");
    }
  });
  app.register(statusRoutes);
  app.register((instance) => registerMemberRoutes(instance, auth, members, readBudget));
  app.register((instance) => registerCommunityRoutes(instance, community, institutions));
  const syntheticNeeds = config.AYINOU_COMMUNITY_NEEDS === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";
  const pilotRelease = (config.AYINOU_COMMUNITY_NEEDS === "pilot" || syntheticNeeds)
    ? config.AYINOU_COMMUNITY_NEEDS_RELEASE ?? null : null;
  const needs = {
    enabled: pilotRelease && institutions ? async () => syntheticNeeds ||
      await institutions.rpc<boolean>("c16_runtime_for_api", { p_release: pilotRelease }) === true : syntheticNeeds,
    auth, repo: institutions, read: readBudget, release: pilotRelease,
  };
  app.register((instance) => registerCommunityNeedsPilot(instance, needs, pilotRelease));
  app.register((instance) => registerCommunityNeeds(instance, needs));
  const syntheticOutcomes = config.AYINOU_PROJECT_OUTCOMES === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";
  app.register((instance) => registerProjectOutcomes(instance, syntheticOutcomes, auth, institutions, readBudget));
  const syntheticOutcomeReview = syntheticOutcomes && config.AYINOU_PROJECT_OUTCOME_REVIEW === "synthetic";
  app.register((instance) => registerProjectOutcomeReview(instance, syntheticOutcomeReview, auth, institutions, readBudget));
  const syntheticOutcomePublication = syntheticOutcomeReview && config.AYINOU_PROJECT_OUTCOME_PUBLICATION === "synthetic";
  app.register((instance) => registerProjectOutcomePublication(instance, syntheticOutcomePublication, auth, institutions, feed, readBudget));
  const syntheticVolunteering = config.AYINOU_VOLUNTEER_PROFILES === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";
  app.register((instance) => registerVolunteering(instance, syntheticVolunteering, auth, institutions, readBudget));
  const syntheticRequirements = config.AYINOU_OPPORTUNITY_REQUIREMENTS === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";
  app.register((instance) => registerOpportunityRequirements(instance, syntheticRequirements, auth, institutions, readBudget));
  const syntheticMatching = syntheticVolunteering && syntheticRequirements && config.AYINOU_VOLUNTEER_MATCHING === "synthetic";
  const syntheticRecruitment = syntheticMatching && config.AYINOU_VOLUNTEER_RECRUITMENT === "synthetic";
  app.register((instance) => registerVolunteerMatching(instance, syntheticMatching, auth, institutions, readBudget, config.SUPABASE_SECRET_KEY, syntheticRecruitment));
  app.register((instance) => registerVolunteerRecruitment(instance, syntheticRecruitment, auth, institutions, readBudget, config.SUPABASE_SECRET_KEY));
  app.register((instance) => registerVolunteerActivation(instance, syntheticRecruitment && config.AYINOU_VOLUNTEER_ACTIVATION === "synthetic", auth, institutions, readBudget));
  app.register(instance => registerProfessionalOpportunities(instance,
    config.AYINOU_PROFESSIONAL_OPPORTUNITIES === "synthetic" && config.SUPABASE_URL === "http://127.0.0.1:55321"
      && process.env.NODE_ENV !== "production", auth, institutions, readBudget));
  const syntheticOpportunityPublication = config.AYINOU_OPPORTUNITY_PUBLICATION === "synthetic" &&
    config.SUPABASE_URL === "http://127.0.0.1:55321" && process.env.NODE_ENV !== "production";
  app.register(instance => registerOpportunityPublication(instance, syntheticOpportunityPublication, auth, institutions, readBudget));
  app.register(instance => registerOpportunityDiscovery(instance, syntheticOpportunityPublication, auth, institutions, readBudget));
  app.register(instance => registerOpportunityActivation(instance,
    syntheticOpportunityPublication && config.AYINOU_OPPORTUNITY_ACTIVATION === "synthetic", auth, institutions, readBudget));
  app.register(instance => registerMentorship(instance,
    config.AYINOU_MENTORSHIP_PROFILES === "synthetic" && config.SUPABASE_URL === "http://127.0.0.1:55321"
      && process.env.NODE_ENV !== "production", auth, institutions, readBudget));
  const syntheticImpact = syntheticOutcomePublication && config.AYINOU_IMPACT_REPORTING === "synthetic";
  app.register((instance) => registerImpact(instance, syntheticImpact, auth, institutions, readBudget));
  app.register((instance) => registerCommunityNeedsReview(instance, needs));
  app.register((instance) => registerCommunityNeedPublication(instance, needs));
  app.register((instance) => registerNeedProjectLinks(instance, needs));
  app.register((instance) => registerInstitutionRoutes(instance, auth, institutions));
  app.register((instance) => registerAdminRoutes(instance, auth, institutions, config.AYINOU_FOUNDER_BOOTSTRAP_ENABLED === "true"));
  app.register((instance) => registerPrivilegedSetup(instance, auth, institutions, config.AYINOU_FOUNDER_BOOTSTRAP_ENABLED === "true"));
  app.register((instance) => registerAdministrationGovernance(instance, auth, institutions));
  app.register((instance) => registerEarlyPartners(instance, auth, institutions));
  app.register((instance) => registerOrganizationOnboarding(instance, auth, institutions, readBudget));
  app.register((instance) => registerSessionSecurity(instance, auth, institutions));
  app.register((instance) => registerAuditRoutes(instance, auth, institutions, readBudget, config.SUPABASE_SECRET_KEY));
  app.register((instance) => registerEnforcementAppeals(instance, auth, feed, institutions, readBudget, config.SUPABASE_SECRET_KEY));
  app.register((instance) => registerFeatureEnforcement(instance, auth, institutions, readBudget, config.SUPABASE_SECRET_KEY));
  app.register((instance) => registerFounderIdentity(instance, auth, institutions));
  app.register((instance) => registerHomepagePolicyRoutes(instance, auth, institutions));
  app.register((instance) => registerDashboardRoutes(instance, auth, institutions, readBudget));
  app.register((instance) => registerMemberExperiencePolicy(instance, auth, institutions));
  app.register((instance) => registerVerificationPolicy(instance, auth, institutions));
  app.register((instance) => registerModerationPolicyRoutes(instance, auth, institutions, readBudget));
  app.register((instance) => registerRegistrationPolicyRoutes(instance, auth, institutions, readBudget));
  app.register((instance) => registerPublicLegalRoutes(instance, institutions));
  app.register((instance) => registerFeedRoutes(instance, auth, feed, media, readBudget));
  app.register((instance) => registerPrivacyRoutes(instance, privacyEnabled, auth,
    privacyEnabled ? overrides?.privacy ?? createPrivacyRepository(config) : null, readBudget));
  app.register((instance) => registerPrivacyExportRoutes(instance, createPrivacyExport(config, privacyEnabled), auth, readBudget));
  app.register((instance) => registerPrivacyLifecycleRoutes(instance, createPrivacyLifecycle(config, privacyEnabled), auth, readBudget));
  app.addHook("onClose", async () => { await members?.close(); });

  return app;
}
