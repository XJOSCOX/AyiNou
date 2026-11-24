import { RemotePreview } from "./image-previews";
import { institutionLink } from "@/components/institution-ui";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import type { PostAttachment } from "@ayinou/shared";
import { useRef, useEffect, useState } from "react";

function ImageViewer({ post, attachments, index, onSelect, review, alt, onClose, guest }: {
  post: string; attachments: PostAttachment[]; index: number; onSelect: (index: number) => void; review: boolean; alt: string; onClose: () => void; guest: boolean;
}) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const attachment = attachments[index];
  return <dialog ref={dialog} onClose={onClose} aria-label={alt} onKeyDown={(event) => {
    if (event.key === "ArrowRight" && index < attachments.length - 1) onSelect(index + 1);
    if (event.key === "ArrowLeft" && index > 0) onSelect(index - 1);
  }} onTouchStart={(event) => { touch.current = event.touches[0]?.clientX ?? null; }}
    onTouchEnd={(event) => {
      if (touch.current === null) return;
      const distance = event.changedTouches[0]?.clientX - touch.current;
      touch.current = null;
      if (distance < -60 && index < attachments.length - 1) onSelect(index + 1);
      if (distance > 60 && index > 0) onSelect(index - 1);
    }}
    className="m-auto max-h-[95dvh] w-[min(95vw,64rem)] max-w-none rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-[var(--theme-text)] backdrop:bg-black/65">
    <div className="mb-2 flex justify-end"><button type="button" className={institutionLink} onClick={() => dialog.current?.close()}>{t.close}</button></div>
    <div className="flex items-center justify-between gap-3 pb-2 text-sm">
      <button type="button" className={institutionLink} disabled={index === 0} onClick={() => onSelect(index - 1)}>{t.previous}</button>
      <span aria-live="polite">{t.position.replace("{current}", String(index + 1)).replace("{total}", String(attachments.length))}</span>
      <button type="button" className={institutionLink} disabled={index === attachments.length - 1} onClick={() => onSelect(index + 1)}>{t.next}</button>
    </div>
    <RemotePreview key={attachment.id} post={post} id={attachment.id} alt={alt} review={review} lazy={false} variant="display" guest={guest} />
  </dialog>;
}

export function PostMediaGallery({ post, attachments, review = false, guest = false }: { post: string; attachments: PostAttachment[]; review?: boolean; guest?: boolean }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const gallery = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const selectedIndex = attachments.findIndex((item) => item.id === active);
  const selected = attachments[selectedIndex];
  if (!attachments.length) return null;
  const alt = (item: PostAttachment, index: number) => item.alt || t.image.replace("{n}", String(index + 1));
  return <div ref={gallery} className={`mt-3 grid min-w-0 gap-2 ${attachments.length === 1 ? "max-w-[42rem]" : "grid-cols-2"}`}>
    {attachments.map((item, index) => <RemotePreview key={item.id} id={item.id} post={post} alt={alt(item, index)} review={review}
      guest={guest} lazy observe={gallery} natural={attachments.length === 1} variant="thumbnail" onOpen={() => setActive(item.id)} label={t.open.replace("{n}", String(index + 1))} />)}
    {selected && <ImageViewer post={post} attachments={attachments} index={selectedIndex} onSelect={(index) => setActive(attachments[index].id)}
      review={review} guest={guest} alt={alt(selected, selectedIndex)} onClose={() => setActive(null)} />}
  </div>;
}
