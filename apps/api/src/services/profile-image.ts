import sharp from "sharp";

export async function safeProfileImage(bytes: Buffer) {
  const source = sharp(bytes, { limitInputPixels: 16_000_000 });
  const { format, pages } = await source.metadata();
  if (!format || !["jpeg", "png", "webp"].includes(format) || (pages ?? 1) > 1) throw new Error("Unsupported image");
  return source.autoOrient().resize(384, 384, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
}
