import type { MemberProfile } from "@ayinou/shared";
import { useState } from "react";
import { uploadAvatar } from "@/lib/api";

export function useProfileAvatar(
  initialUrl: MemberProfile["avatarUrl"],
  setAvatarUrl: (url: string) => void,
  onUnauthorized: () => void,
) {
  const [avatar, setAvatar] = useState(initialUrl);
  const [photoError, setPhotoError] = useState<"photoHint" | "avatarError" | "">("");
  const [uploading, setUploading] = useState(false);

  async function changePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      setAvatar(url);
      setAvatarUrl(url);
    }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "UNAUTHORIZED") onUnauthorized();
      else setPhotoError(code === "INVALID_AVATAR" ? "photoHint" : "avatarError");
    } finally { setUploading(false); }
  }

  return { avatar, photoError, uploading, changePhoto };
}
