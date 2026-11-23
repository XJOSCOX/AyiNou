import { ApiErrorNotice } from "@/components/api-error-notice";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { loadPostImage } from "@/lib/post-media-api";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";

export function LocalPreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const object = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setUrl(object));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(object); };
  }, [file]);
  return url && <Image src={url} alt={alt} width={240} height={160} unoptimized className="aspect-[3/2] w-full rounded object-cover" />;
}

export function RemotePreview({ post, id, alt, review, lazy, variant, onOpen, label, guest = false }: {
  post: string; id: string; alt: string; review: boolean; lazy: boolean; variant: "thumbnail" | "display"; onOpen?: () => void; label?: string; guest?: boolean;
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
    loadPostImage(post, id, variant, review, controller.signal, guest).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ url });
    }).catch((error) => { if (!controller.signal.aborted) setResult({ error }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [guest, id, post, review, revision, variant, visible]);

  const image = result && "url" in result && <Image src={result.url} alt={alt} width={variant === "display" ? 1440 : 480}
    height={variant === "display" ? 960 : 320} unoptimized
    className={variant === "display" ? "max-h-[72dvh] w-full object-contain" : "aspect-[3/2] w-full object-contain"} />;
  return <div ref={frame} className="min-w-0 overflow-hidden rounded-md bg-[var(--theme-control)]">
    {result && "error" in result ? <ApiErrorNotice error={result.error} retry={() => { setResult(undefined); setRevision((n) => n + 1); }} />
      : image ? (onOpen ? <button className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]"
        type="button" onClick={onOpen} aria-label={label}>{image}</button> : image)
      : <p role={visible ? "status" : undefined} className="grid aspect-[3/2] place-items-center p-2 text-center text-sm text-[var(--theme-body)]">{visible && t.loading}</p>}
  </div>;
}
