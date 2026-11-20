import { z } from "zod";
import { ApiError } from "../../services/api-error.js";

const cursorShape = z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
export const pageCursor = z.string().max(250).regex(/^[A-Za-z0-9_-]+$/).optional();

export function before(value?: string) {
  if (!value) return { p_before_at: null, p_before_id: null };
  try {
    const cursor = cursorShape.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { p_before_at: cursor.createdAt, p_before_id: cursor.id };
  } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid page cursor"); }
}

export function paginate<T extends { createdAt: string; id: string }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = rows.length > limit && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null;
  return { page, nextCursor };
}
