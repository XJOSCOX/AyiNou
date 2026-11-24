import type { FastifyInstance } from "fastify";
import type { AuthVerifier } from "../services/auth.js";
import type { FeedRepository } from "../services/feed.js";
import type { PostMediaService } from "../services/post-media.js";
import type { ReadBudget } from "../services/read-budget.js";
import { createFeedRouteContext } from "../modules/feed/context.js";
import { registerCommunityFeedRoutes } from "../modules/feed/communities.js";
import { registerFeedEngagementRoutes } from "../modules/feed/engagement.js";
import { registerFeedModerationRoutes } from "../modules/feed/moderation.js";
import { registerNotificationRoutes } from "../modules/feed/notifications.js";
import { registerPostMediaRoutes } from "../modules/feed/post-media.js";
import { registerPostWriteRoutes } from "../modules/feed/posts.js";
import { registerRecommendationRoutes } from "../modules/feed/recommendations.js";
import { registerSocialRoutes } from "../modules/feed/social.js";
import { registerFeedLanguageRoutes } from "../modules/feed/languages.js";
import { registerFeedTimelineRoutes } from "../modules/feed/timeline.js";
import { registerAmbassadorRoutes } from "./ambassadors.js";
import { registerEventRoutes } from "./events.js";
import { registerDiscoveryRoutes } from "./discovery.js";
import { registerGroupRoutes } from "./groups.js";
import { registerOrganizationRoleRoutes } from "./organization-roles.js";
import { registerPollRoutes } from "./polls.js";
import { registerProjectRoutes } from "./projects.js";
import { registerSafetyRoutes } from "./safety.js";
import { registerTrustRoutes } from "./trust.js";

export async function registerFeedRoutes(app: FastifyInstance, auth: AuthVerifier | null,
  repository: FeedRepository | null, media: PostMediaService | null, read: ReadBudget) {
  const context = createFeedRouteContext(auth, repository, media, read);
  const { viewer, repo } = context;

  // Register on this plugin instance so every route inherits the same cache and error hooks.
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  registerDiscoveryRoutes(app, viewer, repo, read);
  registerEventRoutes(app, context);
  registerSafetyRoutes(app, context);
  registerGroupRoutes(app, { viewer, repo, read });
  registerTrustRoutes(app, { viewer, repo, read });
  registerAmbassadorRoutes(app, { viewer, repo, read });
  registerOrganizationRoleRoutes(app, { viewer, repo, read });
  registerProjectRoutes(app, { viewer, repo, read, media });
  registerPollRoutes(app, { viewer, repo, read });
  registerCommunityFeedRoutes(app, context);
  registerPostMediaRoutes(app, context);
  registerNotificationRoutes(app, context);
  registerFeedTimelineRoutes(app, context);
  registerFeedLanguageRoutes(app, context);
  registerSocialRoutes(app, context);
  registerPostWriteRoutes(app, context);
  registerRecommendationRoutes(app, context);
  registerFeedModerationRoutes(app, context);
  registerFeedEngagementRoutes(app, context);
}
