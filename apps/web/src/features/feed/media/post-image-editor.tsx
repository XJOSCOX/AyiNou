import { LocalPreview, RemotePreview } from "./image-previews";
import { institutionField } from "@/components/institution-ui";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { type SelectedPostImage } from "@/lib/post-media-api";

const control = "grid size-10 place-items-center rounded-md border border-[var(--theme-border)] text-[var(--theme-link)] hover:bg-[var(--theme-selected)] disabled:opacity-40";

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
