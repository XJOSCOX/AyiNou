import sharp from "sharp";
import { ApiError } from "./api-error.js";

export const postUploadMaxBytes = 3 * 1024 * 1024;

export async function safePostImage(bytes: Buffer) {
  if (!bytes.length) throw new ApiError(422, "INVALID_IMAGE", "Invalid image");
  if (bytes.length > postUploadMaxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image too large");
  const input = sharp(bytes, { limitInputPixels: 12_000_000, failOn: "warning" });
  try {
    const { format, width, height, pages } = await input.metadata();
    if (!format || !["jpeg", "png", "webp"].includes(format) || (pages ?? 1) !== 1) {
      throw new ApiError(422, "UNSUPPORTED_IMAGE", "Use a still JPEG, PNG, or WebP image");
    }
    if (!width || !height || width > 6000 || height > 6000) throw new ApiError(422, "INVALID_IMAGE", "Invalid image dimensions");
    async function encode(size: number, byteLimit: number) {
      for (const quality of [77, 61, 45]) {
        const result = await input.clone().autoOrient().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
          .webp({ quality, effort: 3 }).toBuffer({ resolveWithObject: true });
        if (result.data.length <= byteLimit) return result;
      }
      throw new ApiError(422, "IMAGE_PROCESSING", "Image could not be optimized");
    }
    const display = await encode(1440, 524_288);
    const thumbnail = await encode(480, 131_072);
    return { display: display.data, thumbnail: thumbnail.data, width: display.info.width, height: display.info.height };
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(422, "INVALID_IMAGE", "Image could not be decoded safely");
  }
}
