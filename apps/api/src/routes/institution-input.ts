import { z } from "zod";

export const publicInstitutionUrl = z.string().trim().max(300)
  .regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(\/[^\s?#\\]*)?$/)
  .refine((value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } });
