"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./home-page.module.css";

const photos = [
  { en: "Mountains overlooking a coastal town", ht: "Mòn anlè yon vil bò lanmè", fr: "Des montagnes au-dessus d’une ville côtière", es: "Montañas sobre una ciudad costera" },
  { en: "Musicians and Haitian flags in a street parade", ht: "Mizisyen ak drapo Ayiti nan yon parad nan lari", fr: "Des musiciens et des drapeaux haïtiens dans un défilé", es: "Músicos y banderas haitianas en un desfile" },
  { en: "Buildings and trees below green mountains", ht: "Bilding ak pyebwa anba mòn vèt", fr: "Des bâtiments et des arbres au pied de montagnes verdoyantes", es: "Edificios y árboles al pie de montañas verdes" },
  { en: "Palm trees shading a waterfront path", ht: "Pye palmis k ap bay lonbraj sou yon chemen bò dlo", fr: "Des palmiers ombragent un chemin au bord de l’eau", es: "Palmeras que dan sombra a un sendero junto al agua" },
  { en: "Palm trees on a sandy beach", ht: "Pye palmis sou yon plaj sab", fr: "Des palmiers sur une plage de sable", es: "Palmeras en una playa de arena" },
  { en: "A pier across clear water near a beach", ht: "Yon waf sou dlo klè toupre yon plaj", fr: "Une jetée sur une eau limpide près d’une plage", es: "Un muelle sobre aguas claras cerca de una playa" },
  { en: "A waterfront below distant mountains", ht: "Bò dlo ak mòn byen lwen", fr: "Un bord de mer avec des montagnes au loin", es: "Una costa con montañas a lo lejos" },
  { en: "A small boat on turquoise water", ht: "Yon ti bato sou dlo ble tikwaz", fr: "Une petite embarcation sur une eau turquoise", es: "Una pequeña embarcación en aguas turquesas" },
] satisfies ReadonlyArray<Record<Locale, string>>;

const messages = {
  ht: { gallery: "Galri foto", pause: "Mete galri foto a sou poz", play: "Kòmanse galri foto a", show: "Montre foto {number}" },
  fr: { gallery: "Galerie de photos", pause: "Mettre le diaporama en pause", play: "Lancer le diaporama", show: "Afficher la photo {number}" },
  en: { gallery: "Photo gallery", pause: "Pause slideshow", play: "Play slideshow", show: "Show photo {number}" },
  es: { gallery: "Galería de fotos", pause: "Pausar la presentación", play: "Iniciar la presentación", show: "Mostrar la foto {number}" },
} satisfies Record<Locale, { gallery: string; pause: string; play: string; show: string }>;

const motionQuery = "(prefers-reduced-motion: reduce)";
const rotationInterval = 6_000;
const controlClass = "grid h-9 shrink-0 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--theme-link)]";

function subscribeToMotion(onChange: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

const reducedMotion = () => window.matchMedia(motionQuery).matches;
const serverReducedMotion = () => true;

export function HomeSlideshow({ locale }: { locale: Locale }) {
  const [index, setIndex] = useState(0);
  const [initial, setInitial] = useState(true);
  const [rotation, setRotation] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(subscribeToMotion, reducedMotion, serverReducedMotion);
  const playing = rotation ?? !prefersReducedMotion;
  const t = messages[locale];
  const source = String(index + 1).padStart(2, "0");

  useEffect(() => {
    if (!playing || hovered) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setInitial(false);
      setIndex((current) => (current + 1) % photos.length);
    }, rotationInterval);
    return () => window.clearInterval(timer);
  }, [playing, hovered]);

  function jumpTo(next: number) {
    setInitial(false);
    setRotation(false);
    setIndex(next);
  }

  return (
    <section
      aria-label={t.gallery}
      className={`${styles.gallery} relative m-2 aspect-[16/9] overflow-hidden rounded-lg bg-[var(--theme-hero)] md:aspect-auto md:min-h-[424px]`}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) setRotation(false); }}
    >
      <div className={`${styles.slideControls} absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full border border-[var(--theme-border)] bg-[color-mix(in_srgb,var(--theme-surface)_91%,transparent)] px-1 sm:bottom-4`}>
        <button type="button" aria-label={playing ? t.pause : t.play} onClick={() => setRotation(!playing)} className={`${controlClass} w-8`}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={playing ? "M9 5v14m6-14v14" : "m9 5 11 7-11 7z"} />
          </svg>
        </button>
        {photos.map((photo, next) => (
          <button
            key={photo.en}
            type="button"
            aria-label={t.show.replace("{number}", String(next + 1))}
            aria-current={next === index ? "true" : undefined}
            onClick={() => jumpTo(next)}
            className={`${controlClass} w-6`}
          >
            <span
              aria-hidden="true"
              className={next === index ? "h-1.5 w-3.5 rounded-full bg-[var(--theme-link)]" : "size-1.5 rounded-full bg-[var(--theme-body)] opacity-65"}
            />
          </button>
        ))}
      </div>
      <Image
        src={`/home-slides/slide-${source}.webp`}
        alt={photos[index][locale]}
        fill
        sizes="(min-width: 1500px) 720px, (min-width: 768px) 50vw, 100vw"
        className="object-cover"
        preload={initial}
      />
      <span className="sr-only" aria-live={playing ? "off" : "polite"} aria-atomic="true">{photos[index][locale]}</span>
    </section>
  );
}
