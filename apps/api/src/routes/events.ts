import {
  eventCategories, eventFormats, eventResponses, eventScopes, eventVisibilities,
  type CommunityEvent, type EventParticipant, type EventUpdate,
} from "@ayinou/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { FeedRouteContext } from "../modules/feed/context.js";
import { before, pageCursor, paginate } from "../modules/feed/pagination.js";

const idParam = z.strictObject({ id: z.uuid() });
const pagination = z.object({ cursor: pageCursor, limit: z.coerce.number().int().min(1).max(20).default(12) });
const country = z.string().regex(/^[A-Z]{2}$/);
const department = z.string().regex(/^HT-[A-Z]{2}$/);
const locale = z.enum(["ht", "fr", "en", "es"]);
const timestamp = z.iso.datetime({ offset: true });
const url = z.url({ protocol: /^https$/ }).max(1000).nullable();
const reportCategories = z.enum(["harassment", "hate", "spam", "privacy", "other"]);

const form = z.strictObject({
  version: z.number().int().positive().nullable(),
  request: z.uuid(), organizationId: z.uuid().nullable(), communityId: z.uuid().nullable(),
  projectId: z.uuid().nullable(), title: z.string().trim().min(3).max(120), description: z.string().trim().min(3).max(3000),
  category: z.enum(eventCategories), format: z.enum(eventFormats), visibility: z.enum(eventVisibilities),
  startsAt: timestamp, endsAt: timestamp, timeZone: z.string().min(1).max(80),
  country: country.nullable(), department: department.nullable(), locality: z.string().trim().min(1).max(100).nullable(),
  venue: z.string().trim().min(1).max(240).nullable(), meetingUrl: url, coverUrl: url,
  capacity: z.number().int().min(1).max(5000).nullable(), language: locale,
});

export function registerEventRoutes(app: FastifyInstance, { viewer, repo, read, moderator }: FeedRouteContext) {
  async function save(token: string | null, id: string | null, input: z.infer<typeof form>) {
    const { version, request, organizationId, communityId, projectId, startsAt, endsAt, timeZone, meetingUrl, coverUrl, ...details } = input;
    return { event: await repo().rpc<CommunityEvent>(token, "save_event_for_client", {
      p_id: id, p_expected: version, p_request: request, p_organization: organizationId, p_community: communityId,
      p_event: { ...details, project_id: projectId, starts_at: startsAt, ends_at: endsAt, time_zone: timeZone,
        meeting_url: meetingUrl, cover_url: coverUrl },
    }) };
  }

  app.get("/api/v1/events", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const q = pagination.extend({
      scope: z.enum(eventScopes).default("upcoming"), q: z.string().trim().min(1).max(120).optional(),
      format: z.enum(eventFormats).optional(), category: z.enum(eventCategories).optional(), country: country.optional(),
      department: department.optional(), from: timestamp.optional(), until: timestamp.optional(),
    }).parse(request.query);
    const cursor = before(q.cursor);
    const rows = await repo().rpc<CommunityEvent[]>(token, "events_for_client", {
      p_scope: q.scope, p_search: q.q ?? null, p_format: q.format ?? null, p_category: q.category ?? null,
      p_country: q.country ?? null, p_department: q.department ?? null, p_from: q.from ?? null, p_until: q.until ?? null,
      p_after_at: cursor.p_before_at, p_after_id: cursor.p_before_id, p_limit: q.limit,
    });
    return paginate(rows.map((event) => ({ ...event, timelineAt: event.startsAt })), q.limit);
  });

  app.get("/api/v1/events/capabilities", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    return repo().rpc(token, "event_capabilities_for_client");
  });

  app.get("/api/v1/events/:id", async (request) => {
    const { actor, token } = await viewer(request);
    await read("discovery", actor, request.ip);
    const { id } = idParam.parse(request.params);
    const event = await repo().rpc<CommunityEvent | null>(token, "event_for_client", { p_id: id });
    if (!event) throw new ApiError(404, "NOT_FOUND", "Event unavailable");
    return { event };
  });

  app.post("/api/v1/events", async (request) => {
    const { token } = await viewer(request, true);
    return save(token, null, form.parse(request.body));
  });

  app.put("/api/v1/events/:id", async (request) => {
    const { token } = await viewer(request, true);
    return save(token, idParam.parse(request.params).id, form.parse(request.body));
  });

  app.post("/api/v1/events/:id/status", async (request) => {
    const { token } = await viewer(request, true);
    const { id } = idParam.parse(request.params);
    const { version, status } = z.strictObject({
      version: z.number().int().positive(), status: z.enum(["published", "canceled", "completed"]),
    }).parse(request.body);
    return { event: await repo().rpc<CommunityEvent>(token, "transition_event_for_client", { p_id: id, p_expected: version, p_status: status }) };
  });

  app.put("/api/v1/events/:id/rsvp", async (request) => {
    const { token } = await viewer(request, true);
    const { id } = idParam.parse(request.params);
    const { response, listMe } = z.strictObject({ response: z.enum(eventResponses).nullable(), listMe: z.boolean() }).parse(request.body);
    return { event: await repo().rpc<CommunityEvent | null>(token, "rsvp_event_for_client", { p_id: id, p_response: response, p_list_me: listMe }) };
  });

  app.get("/api/v1/events/:id/participants", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const { id } = idParam.parse(request.params);
    const q = pagination.parse(request.query);
    return paginate(await repo().rpc<EventParticipant[]>(token, "event_participants_for_client", {
      p_id: id, ...before(q.cursor), p_limit: q.limit,
    }), q.limit);
  });

  app.get("/api/v1/events/:id/updates", async (request) => {
    const { actor, token } = await viewer(request);
    await read("discovery", actor, request.ip);
    const { id } = idParam.parse(request.params);
    const q = pagination.parse(request.query);
    return paginate(await repo().rpc<EventUpdate[]>(token, "event_updates_for_client", {
      p_id: id, ...before(q.cursor), p_limit: q.limit,
    }), q.limit);
  });

  app.post("/api/v1/events/:id/updates", async (request) => {
    const { token } = await viewer(request, true);
    const { id } = idParam.parse(request.params);
    const { body, submission } = z.strictObject({ body: z.string().trim().min(2).max(1000), submission: z.uuid() }).parse(request.body);
    return { update: await repo().rpc<EventUpdate>(token, "announce_event_for_client", { p_id: id, p_request: submission, p_body: body }) };
  });

  app.post("/api/v1/events/:id/share", async (request) => {
    const { token } = await viewer(request, true);
    const { id } = idParam.parse(request.params);
    const { body, language, submission } = z.strictObject({
      body: z.string().trim().min(1).max(1500), language: locale, submission: z.uuid(),
    }).parse(request.body);
    return { postId: await repo().rpc<string>(token, "share_event_for_client", {
      p_id: id, p_request: submission, p_body: body, p_language: language,
    }) };
  });

  app.post("/api/v1/events/:id/report", async (request) => {
    const { token } = await viewer(request, true);
    const { id } = idParam.parse(request.params);
    const { category, note } = z.strictObject({ category: reportCategories, note: z.string().trim().max(500) }).parse(request.body);
    return { reported: await repo().rpc<boolean>(token, "report_event_for_client", { p_id: id, p_category: category, p_note: note }) };
  });

  app.get("/api/v1/events/moderation/reports", async (request) => {
    const { token, actor } = await moderator(request);
    await read("discovery", actor, request.ip);
    const q = pagination.parse(request.query);
    const rows = await repo().rpc<{ id: string; createdAt: string }[]>(token, "event_reports_for_client", {
      ...before(q.cursor), p_limit: q.limit,
    });
    return paginate(rows, q.limit);
  });

  app.post("/api/v1/events/moderation/reports/:id", async (request) => {
    const { token } = await moderator(request);
    const { id } = idParam.parse(request.params);
    const { action, reason } = z.strictObject({
      action: z.enum(["restricted", "restored", "dismissed"]), reason: z.string().trim().min(10).max(500),
    }).parse(request.body);
    const resolved = await repo().rpc<boolean>(token, "moderate_event_for_client", { p_report: id, p_action: action, p_reason: reason });
    if (!resolved) throw new ApiError(403, "APPEAL_REVIEW_CONFLICT", "An independent moderator is required");
    return { resolved };
  });

  app.get("/api/v1/events/notification-preference", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    return { enabled: await repo().rpc<boolean>(token, "event_notification_preference_for_client", { p_enabled: null }) };
  });

  app.put("/api/v1/events/notification-preference", async (request) => {
    const { token } = await viewer(request, true);
    const { enabled } = z.strictObject({ enabled: z.boolean() }).parse(request.body);
    return { enabled: await repo().rpc<boolean>(token, "event_notification_preference_for_client", { p_enabled: enabled }) };
  });
}
