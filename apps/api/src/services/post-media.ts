import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import { feedDatabaseError } from "./feed.js";
import { safePostImage } from "./post-image.js";

export type PostImageVariant = "thumbnail" | "display";

export interface PostMediaService {
  upload(actor: string, id: string, raw: Buffer): Promise<void>;
  uploadProjectImage?(actor: string, id: string, version: number, raw: Buffer): Promise<number>;
  uploadProjectProgress?(actor: string, id: string, entry: string, version: number, raw: Buffer): Promise<number>;
  download(id: string, variant: PostImageVariant): Promise<Buffer>;
  cleanup(): Promise<number>;
}

export function createPostMediaService(config: ApiConfig): PostMediaService | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null;
  const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const deadline = AbortSignal.timeout(20_000);
        return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
      },
    },
  });
  const bucket = admin.storage.from("post-media");
  let processing = 0;
  let cleaning: Promise<number> | null = null;
  const path = (id: string, variant: PostImageVariant) => `${id}/${variant}.webp`;
  const unavailable = () => new ApiError(503, "STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");

  async function rpc<T>(name: string, parameters?: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, parameters);
    if (error) throw feedDatabaseError(error.code);
    return data as T;
  }

  async function purge() {
    const ids = await rpc<string[]>("claim_post_media_cleanup_for_api");
    if (!ids.length) return 0;
    const { error } = await bucket.remove(ids.flatMap((id) => [path(id, "thumbnail"), path(id, "display")]));
    if (error) throw unavailable();
    await rpc("finish_post_media_cleanup_for_api", { p_ids: ids });
    return ids.length;
  }

  async function processImage<T>(raw: Buffer, save: (image: Awaited<ReturnType<typeof safePostImage>>) => Promise<T>) {
    if (processing >= 2) throw new ApiError(503, "IMAGE_BUSY", "Image processing is busy");
    processing++;
    try { return await save(await safePostImage(raw)); }
    finally { processing--; }
  }

  return {
    cleanup() {
      cleaning ??= purge().finally(() => { cleaning = null; });
      return cleaning;
    },
    async upload(actor, id, raw) {
      return processImage(raw, async (image) => {
        const lease = randomUUID();
        const reserved = await rpc<boolean>("reserve_post_upload_for_api", {
          p_actor: actor, p_id: id, p_lease: lease, p_digest: createHash("sha256").update(raw).digest("hex"),
          p_width: image.width, p_height: image.height, p_thumb: image.thumbnail.length, p_display: image.display.length,
        });
        if (!reserved) return;
        try {
          for (const variant of ["thumbnail", "display"] as const) {
            const { error } = await bucket.upload(path(id, variant), image[variant], {
              contentType: "image/webp", cacheControl: "0", upsert: true,
            });
            if (error) throw unavailable();
          }
          if (!await rpc<boolean>("finish_post_upload_for_api", { p_id: id, p_lease: lease, p_ready: true })) throw unavailable();
        } catch (cause) {
          await rpc("finish_post_upload_for_api", { p_id: id, p_lease: lease, p_ready: false }).catch(() => undefined);
          throw cause instanceof ApiError ? cause : unavailable();
        }
      });
    },
    async uploadProjectImage(actor, id, version, raw) {
      return processImage(raw, (image) => rpc<number>("project_image_for_api", {
        p_actor: actor, p_id: id, p_version: version, p_webp: image.display.toString("base64"),
      }));
    },
    async uploadProjectProgress(actor, id, entry, version, raw) {
      return processImage(raw, (image) => rpc<number>("project_progress_image_for_api", {
        p_actor: actor, p_id: id, p_entry: entry, p_version: version, p_webp: image.display.toString("base64"),
      }));
    },
    async download(id, variant) {
      const { data, error } = await bucket.download(path(id, variant));
      if (error || !data) throw unavailable();
      if (data.size > (variant === "thumbnail" ? 131_072 : 524_288)) throw unavailable();
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
