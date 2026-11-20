import type { AttachmentInput } from "@ayinou/shared";
import { authorizedImage, authorizedRequest } from "./api";
import { ApiRequestError } from "./api-errors";

export type SelectedPostImage = { id: string; alt: string; file?: File };
export const postImageMaxBytes = 3_145_728;

export function attachmentInput(images: SelectedPostImage[]): AttachmentInput[] {
  return images.map(({ id, alt }) => ({ id, alt: alt.trim() || null }));
}

export async function stagePostImage(id: string, file: File) {
  if (file.size > postImageMaxBytes) throw new ApiRequestError("PAYLOAD_TOO_LARGE", 413);
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new ApiRequestError("INVALID_IMAGE", 422));
    reader.readAsDataURL(file);
  });
  const deadline = AbortSignal.timeout(65_000);
  try {
    await authorizedRequest("/api/v1/me/post-media", {
      method: "POST", headers: { "Idempotency-Key": id }, body: JSON.stringify({ image }), signal: deadline,
    });
  } catch (cause) {
    if (deadline.aborted) throw new ApiRequestError("TIMEOUT", 0, true);
    throw cause;
  }
}

export async function loadPostImage(post: string, id: string, variant: "thumbnail" | "display", review: boolean, signal: AbortSignal) {
  const deadline = AbortSignal.timeout(30_000);
  try {
    return await authorizedImage(`/api/v1/posts/${post}/attachments/${id}/image?variant=${variant}${review ? "&review=true" : ""}`,
      AbortSignal.any([signal, deadline]));
  } catch (cause) {
    if (deadline.aborted && !signal.aborted) throw new ApiRequestError("TIMEOUT", 0, true);
    throw cause;
  }
}
