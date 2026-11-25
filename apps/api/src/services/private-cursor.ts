import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { ZodType } from "zod";
import { ApiError } from "./api-error.js";

export function createPrivateCursor<T extends { expires: number }>(secret: string, namespace: string, schema: ZodType<T>, errorMessage: string) {
  const key = createHmac("sha256", secret).update(namespace).digest();
  const context = (binding: readonly unknown[]) => Buffer.from(JSON.stringify(binding));

  return {
    seal(value: T, binding: readonly unknown[]): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(context(binding));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    },
    open(value: string, binding: readonly unknown[]): T {
      try {
        const data = Buffer.from(value, "base64url");
        if (data.length <= 28 || data.toString("base64url") !== value) throw new Error("Malformed");
        const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
        cipher.setAAD(context(binding));
        cipher.setAuthTag(data.subarray(12, 28));
        const decoded = Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
        const cursor = schema.parse(JSON.parse(decoded.toString("utf8")));
        if (cursor.expires <= Date.now()) throw new Error("Expired");
        return cursor;
      } catch {
        throw new ApiError(400, "INVALID_INPUT", errorMessage);
      }
    },
  };
}
