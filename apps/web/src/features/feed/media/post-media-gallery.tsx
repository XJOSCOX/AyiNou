import { RemotePreview } from "./image-previews";
import { institutionLink } from "@/components/institution-ui";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import type { PostAttachment } from "@ayinou/shared";
import { useRef, useEffect, useState } from "react";

function ImageViewer({ post, attachment, review, alt, onClose, guest }: {
  post: string; attachment: PostAttachment; review: boolean; alt: string; onClose: () => void; guest: boolean;
}) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return <dialog ref={dialog} onClose={onClose} aria-label={alt}
    className="m-auto max-h-[95dvh] w-[min(95vw,64rem)] max-w-none rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-[var(--theme-text)] backdrop:bg-black/65">
    <div className="mb-2 flex justify-end"><button type="button" className={institutionLink} onClick={() => dialog.current?.close()}>{t.close}</button></div>
    <RemotePreview post={post} id={attachment.id} alt={alt} review={review} lazy={false} variant="display" guest={guest} />
  </dialog>;
}

export function PostMediaGallery({ post, attachments, review = false, guest = false }: { post: string; attachments: PostAttachment[]; review?: boolean; guest?: boolean }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const [active, setActive] = useState<string | null>(null);
  const selected = attachments.find((item) => item.id === active);
  if (!attachments.length) return null;
  const alt = (item: PostAttachment, index: number) => item.alt || t.image.replace("{n}", String(index + 1));
  return <div className={`mt-4 grid gap-2 ${attachments.length > 1 ? "grid-cols-2" : "max-w-[42rem]"}`}>
    {attachments.map((item, index) => <RemotePreview key={item.id} id={item.id} post={post} alt={alt(item, index)} review={review}
      guest={guest} lazy variant="thumbnail" onOpen={() => setActive(item.id)} label={t.open.replace("{n}", String(index + 1))} />)}
    {selected && <ImageViewer post={post} attachment={selected} review={review} guest={guest} alt={alt(selected, attachments.indexOf(selected))} onClose={() => setActive(null)} />}
  </div>;
}
