import { z } from "zod";
import { createPrivateCursor } from "./private-cursor.js";

export const auditTimestamp = z.iso.datetime({ offset: true });
const cursorData = z.strictObject({
  expires: z.number().int(),
  high: auditTimestamp,
  at: auditTimestamp,
  source: z.string().regex(/^[a-z_]{1,32}$/),
  id: z.string().regex(/^[0-9a-f-]{1,36}$/),
});

export type AuditCursor = z.infer<typeof cursorData>;

export function createAuditCursor(secret: string) {
  return createPrivateCursor(secret, "ayinou-audit-cursor-v1", cursorData, "Invalid audit cursor");
}
