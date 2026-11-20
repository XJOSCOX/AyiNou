import { interestCodes, locales, postVisibilities, reportCategories } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../../services/api-error.js";
import { pageCursor } from "./pagination.js";

export const feedQuery = z.strictObject({
  scope: z.enum(["feed", "mine", "following", "for_you"]).default("feed"), cursor: pageCursor,
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(40)).optional(),
});
export const identifiers = z.object({ id: z.uuid() });
export const version = z.number().int().min(1).max(2_147_483_647);
export const postFields = z.strictObject({ body: z.string(), language: z.enum(locales), visibility: z.enum(postVisibilities) });
export const topics = z.array(z.enum(interestCodes)).refine((codes) => new Set(codes).size === codes.length);
const attachments = z.array(z.strictObject({
  id: z.uuid(),
  alt: z.string().trim().max(240).refine((value) => !/\p{Cc}/u.test(value)).nullish(),
})).max(4).refine((items) => new Set(items.map(({ id }) => id.toLowerCase())).size === items.length);
export const postInput = postFields.extend({ topics: z.array(z.enum(interestCodes)).max(3).pipe(topics).optional(), attachments: attachments.optional() });

export const versionQuery = z.strictObject({ version: z.string().regex(/^\d{1,10}$/).transform(Number).pipe(version) });

const communityKey = z.string().max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const communityParams = z.object({ key: communityKey });

export function content(body: string, limit: number) {
  if (!body.trim() || Array.from(body).length > limit || /\p{Cc}/u.test(body.replace(/[\t\r\n]/g, ""))) {
    throw new ApiError(422, "INVALID_CONTENT", "Content does not meet posting requirements");
  }
}

export const reportInput = z.strictObject({ category: z.enum(reportCategories), note: z.string().trim().optional() });
