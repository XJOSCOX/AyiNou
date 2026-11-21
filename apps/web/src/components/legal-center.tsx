"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale-store";
import { languageNames, locales, type Locale } from "@/lib/i18n";
import { policyPaths, type PolicyId } from "@/lib/legal/paths";
import type { LegalRelease } from "@/lib/legal/publication";
import styles from "./legal-center.module.css";
import { LegalContentBlock } from "./legal-content";

const copy = {
  ht: { center: "Sant legal", unavailable: "Dokiman sa a poko disponib kòm yon règleman ki pibliye.", intro: "Règleman ki apwouve epi pibliye yo ap parèt isit la lè yo disponib.", history: "Istwa vèsyon yo", noHistory: "Pa gen okenn vèsyon ki pibliye.", version: "Vèsyon", effective: "Dat li antre anvigè", published: "Dat piblikasyon", contents: "Sa ki ladan l", related: "Dokiman", languages: "Lang dokiman an" },
  fr: { center: "Centre juridique", unavailable: "Ce document n’est pas encore disponible comme politique publiée.", intro: "Les politiques approuvées et publiées apparaîtront ici lorsqu’elles seront disponibles.", history: "Historique des versions", noHistory: "Aucune version publiée.", version: "Version", effective: "Date d’entrée en vigueur", published: "Date de publication", contents: "Sommaire", related: "Documents", languages: "Langue du document" },
  en: { center: "Legal Center", unavailable: "This document is not yet available as a published policy.", intro: "Approved and published policies will appear here when available.", history: "Version history", noHistory: "No published versions are available.", version: "Version", effective: "Effective date", published: "Published", contents: "On this page", related: "Documents", languages: "Document language" },
  es: { center: "Centro legal", unavailable: "Este documento aún no está disponible como política publicada.", intro: "Las políticas aprobadas y publicadas aparecerán aquí cuando estén disponibles.", history: "Historial de versiones", noHistory: "No hay versiones publicadas.", version: "Versión", effective: "Fecha de entrada en vigor", published: "Fecha de publicación", contents: "En esta página", related: "Documentos", languages: "Idioma del documento" },
} satisfies Record<Locale, Record<string, string>>;

const names: Record<Locale, Record<PolicyId, string>> = {
  en: { terms: "Terms & Conditions", privacy: "Privacy Policy", "community-guidelines": "Community Guidelines", organizations: "Organizations", "projects-and-volunteers": "Projects and volunteers", voting: "Voting", verification: "Verification", cookies: "Cookies", "data-rights": "Data rights" },
  fr: { terms: "Conditions d’utilisation", privacy: "Politique de confidentialité", "community-guidelines": "Règles communautaires", organizations: "Organisations", "projects-and-volunteers": "Projets et bénévoles", voting: "Votes", verification: "Vérification", cookies: "Cookies", "data-rights": "Droits relatifs aux données" },
  ht: { terms: "Kondisyon itilizasyon", privacy: "Règleman sou vi prive", "community-guidelines": "Règ kominote a", organizations: "Òganizasyon", "projects-and-volunteers": "Pwojè ak volontè", voting: "Vòt", verification: "Verifikasyon", cookies: "Cookies", "data-rights": "Dwa sou done" },
  es: { terms: "Términos y condiciones", privacy: "Política de privacidad", "community-guidelines": "Normas comunitarias", organizations: "Organizaciones", "projects-and-volunteers": "Proyectos y voluntariado", voting: "Votaciones", verification: "Verificación", cookies: "Cookies", "data-rights": "Derechos sobre los datos" },
};

type ListedVersion = { policyId?: PolicyId; version: string; effectiveDate: string };
type Props = { policyId?: PolicyId; history?: boolean; release?: LegalRelease; versions?: ListedVersion[]; available?: ListedVersion[] };
export function LegalCenter({ policyId, history = false, release, versions = [], available = [] }: Props) {
  const [locale, setLocale] = useLocale();
  const router = useRouter();
  const t = copy[locale];
  const variant = release?.variants.find((item) => item.locale === locale);
  const title = history ? t.history : policyId ? names[locale][policyId] : t.center;
  return <div className={`public-container ${styles.page}`}>
    <header className={styles.header}>
      <div><Link href="/legal" className={styles.eyebrow}>{t.center}</Link><h1>{title}</h1></div>
      <label className={styles.language}>{t.languages}
        <select value={locale} onChange={(event) => { setLocale(event.target.value as Locale); router.refresh(); }}>
          {locales.map((item) => <option value={item} key={item}>{languageNames[item]}</option>)}
        </select>
      </label>
    </header>
    {history ? <section className={styles.panel} aria-label={t.history}>{versions.length ? <ul>{versions.map((item) => <li key={`${item.policyId}:${item.version}`}><Link href={`${policyPaths[item.policyId!]}?version=${encodeURIComponent(item.version)}`}>{names[locale][item.policyId!]} · {item.version}</Link> · {item.effectiveDate}</li>)}</ul> : <p>{t.noHistory}</p>}</section>
      : release && variant ? <div className={styles.layout} lang={locale}>
        <article className={styles.panel}>
          <h2>{variant.document.title}</h2>
          <dl className={styles.meta}><div><dt>{t.version}</dt><dd>{release.version}</dd></div><div><dt>{t.effective}</dt><dd>{release.effectiveDate}</dd></div><div><dt>{t.published}</dt><dd>{release.publishedAt.slice(0, 10)}</dd></div></dl>
          {versions.length > 1 && <nav aria-label={t.history}>{versions.map((item) => <Link key={item.version} href={`${policyPaths[release.policyId]}?version=${encodeURIComponent(item.version)}`}>{t.version} {item.version}</Link>)}</nav>}
          {variant.document.sections.map((section) => <section id={section.id} key={section.id} className={styles.section}><h3>{section.title}</h3>{section.blocks.map((block, index) => <LegalContentBlock block={block} key={index} />)}</section>)}
        </article><aside className={styles.panel}><h2>{t.contents}</h2><nav aria-label={t.contents}>{variant.document.sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav></aside>
      </div> : <section className={styles.panel}>{!policyId && available.length ?
        <ul>{available.map((item) => <li key={`${item.policyId}:${item.version}`}><Link href={policyPaths[item.policyId!]}>{names[locale][item.policyId!]} · {item.version}</Link> · {item.effectiveDate}</li>)}</ul>
        : <p>{policyId ? t.unavailable : t.intro}</p>}</section>}
    <nav className={styles.related} aria-label={t.related}><h2>{t.related}</h2><div>{(Object.keys(policyPaths) as PolicyId[]).map((id) => <Link href={policyPaths[id]} key={id}>{names[locale][id]}</Link>)}<Link href="/legal/history">{t.history}</Link></div></nav>
  </div>;
}
