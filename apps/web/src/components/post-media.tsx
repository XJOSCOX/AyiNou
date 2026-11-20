"use client";

import type { PostAttachment } from "@ayinou/shared";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { loadPostImage, type SelectedPostImage } from "@/lib/post-media-api";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionField, institutionLink } from "./institution-ui";

const control = "grid size-10 place-items-center rounded-md border border-[var(--theme-border)] text-[var(--theme-link)] hover:bg-[var(--theme-selected)] disabled:opacity-40";

function LocalPreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const object = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setUrl(object));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(object); };
  }, [file]);
  return url && <Image src={url} alt={alt} width={240} height={160} unoptimized className="aspect-[3/2] w-full rounded object-cover" />;
}

function RemotePreview({ post, id, alt, review, lazy, variant, onOpen, label }: {
  post: string; id: string; alt: string; review: boolean; lazy: boolean; variant: "thumbnail" | "display"; onOpen?: () => void; label?: string;
}) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string } | { error: unknown }>();
  useEffect(() => {
    if (!lazy || !frame.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [lazy]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let url: string | undefined;
    loadPostImage(post, id, variant, review, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ url });
    }).catch((error) => { if (!controller.signal.aborted) setResult({ error }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, post, review, revision, variant, visible]);

  const image = result && "url" in result && <Image src={result.url} alt={alt} width={variant === "display" ? 1440 : 480}
    height={variant === "display" ? 960 : 320} unoptimized
    className={variant === "display" ? "max-h-[72dvh] w-full object-contain" : "aspect-[3/2] w-full object-cover"} />;
  return <div ref={frame} className="min-w-0 overflow-hidden rounded-md bg-[var(--theme-control)]">
    {result && "error" in result ? <ApiErrorNotice error={result.error} retry={() => { setResult(undefined); setRevision((n) => n + 1); }} />
      : image ? (onOpen ? <button className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]"
        type="button" onClick={onOpen} aria-label={label}>{image}</button> : image)
      : <p role={visible ? "status" : undefined} className="grid aspect-[3/2] place-items-center p-2 text-center text-sm text-[var(--theme-body)]">{visible && t.loading}</p>}
  </div>;
}

export function PostImageEditor({ post, images, onChange, busy }: {
  post?: string; images: SelectedPostImage[]; onChange: (images: SelectedPostImage[]) => void; busy: boolean;
}) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  function move(index: number, step: number) {
    const next = images.slice();
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  }
  if (!images.length) return null;
  return <fieldset className="min-w-0" disabled={busy}>
    <legend className="sr-only">{t.images} · {images.length}/4</legend>
    <ul className="grid gap-2 sm:grid-cols-2">{images.map(({ id, file, alt }, index) => {
      const name = (label: string) => label.replace("{n}", String(index + 1));
      return <li key={id} className="min-w-0 rounded-md border border-[var(--theme-border)] p-2">
        {file ? <LocalPreview file={file} alt={alt || name(t.image)} /> : post &&
          <RemotePreview post={post} id={id} alt={alt || name(t.image)} review={false} lazy variant="thumbnail" />}
        <input aria-label={`${t.alt} · ${name(t.image)}`} placeholder={t.alt} value={alt} maxLength={240} className={institutionField}
          onChange={(event) => onChange(images.map((item) => item.id === id ? { ...item, alt: event.target.value } : item))} />
        <div className="mt-2 flex flex-wrap gap-1">
          <button className={control} type="button" aria-label={name(t.earlier)} title={name(t.earlier)} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button className={control} type="button" aria-label={name(t.later)} title={name(t.later)} disabled={index === images.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button className={control} type="button" aria-label={name(t.remove)} title={name(t.remove)}
            onClick={() => onChange(images.filter((item) => item.id !== id))}>×</button>
        </div>
      </li>;
    })}</ul>
  </fieldset>;
}

function ImageViewer({ post, attachment, review, alt, onClose }: {
  post: string; attachment: PostAttachment; review: boolean; alt: string; onClose: () => void;
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
    <RemotePreview post={post} id={attachment.id} alt={alt} review={review} lazy={false} variant="display" />
  </dialog>;
}

export function PostMediaGallery({ post, attachments, review = false }: { post: string; attachments: PostAttachment[]; review?: boolean }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const [active, setActive] = useState<string | null>(null);
  const selected = attachments.find((item) => item.id === active);
  if (!attachments.length) return null;
  const alt = (item: PostAttachment, index: number) => item.alt || t.image.replace("{n}", String(index + 1));
  return <div className={`mt-4 grid gap-2 ${attachments.length > 1 ? "grid-cols-2" : "max-w-[42rem]"}`}>
    {attachments.map((item, index) => <RemotePreview key={item.id} id={item.id} post={post} alt={alt(item, index)} review={review}
      lazy variant="thumbnail" onOpen={() => setActive(item.id)} label={t.open.replace("{n}", String(index + 1))} />)}
    {selected && <ImageViewer post={post} attachment={selected} review={review} alt={alt(selected, attachments.indexOf(selected))} onClose={() => setActive(null)} />}
  </div>;
}
