
import { mentorshipConsiderations, mentorshipGeographies, mentorshipReportCategories, mentorshipRoles, mentorshipTopics, volunteerLanguages, volunteerModes } from "@ayinou/shared";
import { z } from "zod";

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => !/\p{Cc}/u.test(value.replaceAll("\n", "")));
const timestamp = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
const token = z.string().max(1800).regex(/^[0-9a-f]+\.[0-9a-f]{64}$/);
const uniqueTopics = z.array(z.enum(mentorshipTopics)).min(1).max(8).refine(items => new Set(items).size === items.length);
const receipt = { requestId: z.uuid() };
const version = { expectedVersion: integer(1, 2147483646) };
const record = { ...receipt, ...version, id: z.uuid() };
const confirmed = { confirmed: z.literal(true) };
const item = { item: z.uuid(), itemVersion: integer(1, 2147483646) };

export const coordinationDashboard = z.strictObject({ before: z.uuid().optional() });
export const coordinationCandidates = z.strictObject({
  lane: z.enum(["discovery", "recommendations"]), role: z.enum(mentorshipRoles),
  topic: z.enum(mentorshipTopics).optional(), mode: z.enum(volunteerModes).optional(),
  geography: z.enum(mentorshipGeographies).optional(), language: z.enum(volunteerLanguages).optional(),
  skill: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/).optional(), cursor: token.optional(),
});
export const coordinationResource = z.strictObject({ id: z.uuid() });
export const coordinationCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("send"), selection: token, introduction: text(0, 400) }),
  z.strictObject({ ...receipt, action: z.literal("dismiss"), selection: token }),
  z.strictObject({ ...record, action: z.enum(["accept", "decline", "withdraw"]) }),
  z.strictObject({ ...receipt, id: z.uuid(), action: z.literal("report"), explanation: text(10, 1000),
    category: z.enum(mentorshipReportCategories) }),
  z.strictObject({ ...record, ...confirmed, action: z.enum(["pause", "resume", "end", "complete"]) }),
  z.strictObject({ ...record, action: z.literal("propose_agreement"), terms: z.strictObject({
    title: text(3, 100), objectives: text(3, 750), expectations: text(3, 750),
    weeks: integer(1, 52), frequency: integer(1, 4), minutes: integer(15, 120),
    mode: z.enum(volunteerModes), topics: uniqueTopics, free: z.literal(true), safeguarding: z.literal(true),
  }) }),
  z.strictObject({ ...record, ...confirmed, action: z.literal("confirm_agreement"), revision: integer(1, 30) }),
  z.strictObject({ ...record, ...item, action: z.enum(["agree_item", "decline_item", "cancel_item", "complete_item"]) }),
  z.strictObject({
    ...record, action: z.literal("propose_item"), kind: z.enum(["objective", "progress", "session"]),
    item: item.item.optional(), itemVersion: item.itemVersion.optional(), objective: z.uuid().optional(),
    content: z.union([z.strictObject({ text: text(3, 500) }), z.strictObject({
      localStart: timestamp, timeZone: text(1, 64), minutes: integer(15, 120), topic: text(3, 100),
    })]),
  }).refine(value => (value.kind === "session") === ("localStart" in value.content)
    && (!!value.item === !!value.itemVersion) && (value.kind === "progress") === !!value.objective),
]);

const review = { ...receipt, ...version, ...confirmed, reason: text(10, 500) };
export const mentorshipModerationCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...review, action: z.literal("assign"), reviewer: text(2, 50) }),
  z.strictObject({ ...review, action: z.enum(["refer", "close"]) }),
]);

export const coordinationPreparation = z.strictObject({
  ...receipt, ...confirmed, expectedVersion: integer(0, 2147483646), reason: text(10, 500),
  settings: z.strictObject({
    recommendationLimit: integer(1, 12), senderDaily: integer(1, 5), recipientDaily: integer(1, 5),
    outstanding: integer(1, 5), expiryDays: integer(1, 14), cooldownDays: integer(14, 90),
    capacity: integer(1, 8), agreementWeeks: integer(1, 52), sessionDays: integer(7, 90), sessionMinutes: integer(15, 120),
    considerations: z.array(z.enum(mentorshipConsiderations)).max(3).refine(items => new Set(items).size === items.length),
    safeguardingSince: z.iso.date(), safeguardingNotes: text(0, 500), moderationNotes: text(0, 500),
  }),
});
