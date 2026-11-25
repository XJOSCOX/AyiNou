import { z } from "zod";
import { createPrivateCursor } from "./private-cursor.js";

export const selectionValue = z.string().regex(/^[A-Za-z0-9_-]{1,384}$/);
const selection = z.strictObject({ handle: z.string().min(1).max(40), revision: z.number().int().positive(), expires: z.number().int() });

export function createRecruitmentSelection(secret: string) {
  return createPrivateCursor(secret, "ayinou-recruitment-selection-v1", selection, "Refresh discovery to select a volunteer");
}
