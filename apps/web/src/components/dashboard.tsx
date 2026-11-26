"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { impactIndicators, type CommunityEvent, type ImpactResponse, type MemberProfile, type OpportunityDiscoveryPage, type ProjectCard } from "@ayinou/shared";
import { fetchMyProfile, publicRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { dashboardSections, loadDashboardEvents, loadDashboardImpact, loadDashboardOpportunities,
  loadDashboardProjects, loadDashboardSummary, saveDashboardPreferences,
  type DashboardSection, type DashboardSummary } from "@/lib/dashboard-api";
import { loadUnreadCount } from "@/lib/notification-api";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { impactCopy } from "@/lib/impact-i18n";
import { PersonalClaimChecks } from "./institution-ui";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { MemberShell } from "./member-shell";

const words = {
  intro: ["Your place to connect, contribute, and follow progress across Haiti and the diaspora.", "Espas ou pou konekte, kontribye epi swiv pwogrè ann Ayiti ak nan dyaspora a.", "Votre espace pour échanger, contribuer et suivre les progrès en Haïti et dans la diaspora.", "Tu espacio para conectar, contribuir y seguir el progreso en Haití y la diáspora."],
  customize: ["Customize dashboard", "Ranje tablodbò a", "Personnaliser le tableau de bord", "Personalizar el panel"],
  personal: ["Your community", "Kominote ou", "Votre communauté", "Tu comunidad"],
  followers: ["Followers", "Moun k ap swiv ou", "Abonnés", "Seguidores"],
  following: ["Following", "Moun w ap swiv", "Abonnements", "Siguiendo"],
  joined: ["Communities joined", "Kominote ou antre", "Communautés rejointes", "Comunidades a las que te uniste"],
  groups: ["Groups joined", "Gwoup ou antre", "Groupes rejoints", "Grupos a los que te uniste"],
  saved: ["Saved posts", "Pòs ou anrejistre", "Publications enregistrées", "Publicaciones guardadas"],
  explore: ["Explore AyiNou", "Dekouvri AyiNou", "Explorer AyiNou", "Explorar AyiNou"],
  feed: ["Feed", "Fil", "Fil d’actualité", "Publicaciones"],
  discover: ["Discover", "Dekouvri", "Découvrir", "Descubrir"],
  groupsLink: ["Groups", "Gwoup", "Groupes", "Grupos"],
  communitiesLink: ["Communities", "Kominote", "Communautés", "Comunidades"],
  projectsLink: ["Projects", "Pwojè", "Projets", "Proyectos"],
  eventsLink: ["Events", "Evènman", "Événements", "Eventos"],
  organizations: ["Organizations", "Òganizasyon", "Organisations", "Organizaciones"],
  announcements: ["Official announcements", "Anons ofisyèl", "Annonces officielles", "Anuncios oficiales"],
  events: ["Upcoming events", "Evènman k ap vini", "Événements à venir", "Próximos eventos"],
  projects: ["Featured projects", "Pwojè pou dekouvri", "Projets à découvrir", "Proyectos destacados"],
  communities: ["Your communities", "Kominote ou yo", "Vos communautés", "Tus comunidades"],
  opportunities: ["Latest opportunities", "Dènye opòtinite", "Dernières occasions", "Últimas oportunidades"],
  impact: ["Community impact", "Enpak kominote a", "Impact communautaire", "Impacto comunitario"],
  statistics: ["AyiNou at a glance", "AyiNou an kout je", "AyiNou en bref", "AyiNou de un vistazo"],
  attention: ["For you", "Pou ou", "Pour vous", "Para ti"],
  proposals: ["My proposals", "Pwopozisyon mwen", "Mes propositions", "Mis propuestas"],
  notifications: ["Unread notifications", "Notifikasyon ou poko li", "Notifications non lues", "Notificaciones sin leer"],
  none: ["Nothing new right now. Explore what your community is doing.", "Pa gen anyen nouvo kounye a. Dekouvri sa kominote ou ap fè.", "Rien de nouveau pour le moment. Découvrez ce que fait votre communauté.", "Nada nuevo por ahora. Descubre lo que hace tu comunidad."],
  eventEmpty: ["No upcoming events are available yet.", "Pa gen evènman k ap vini pou kounye a.", "Aucun événement à venir pour le moment.", "Aún no hay eventos próximos."],
  projectEmpty: ["No public projects are available yet.", "Pa gen pwojè piblik pou kounye a.", "Aucun projet public pour le moment.", "Aún no hay proyectos públicos."],
  communityEmpty: ["Join a community to see it here.", "Antre nan yon kominote pou wè li isit la.", "Rejoignez une communauté pour la voir ici.", "Únete a una comunidad para verla aquí."],
  browse: ["Browse all", "Gade tout", "Tout voir", "Ver todos"],
  show: ["Show", "Montre", "Afficher", "Mostrar"],
  hide: ["Hide", "Kache", "Masquer", "Ocultar"],
  up: ["Move up", "Monte", "Monter", "Subir"],
  down: ["Move down", "Desann", "Descendre", "Bajar"],
  saveLayout: ["Save layout", "Anrejistre aranjman an", "Enregistrer la disposition", "Guardar diseño"],
  restore: ["Restore defaults", "Retabli jan li te ye a", "Rétablir les valeurs par défaut", "Restaurar valores predeterminados"],
  savedLayout: ["Dashboard saved.", "Tablodbò a anrejistre.", "Tableau de bord enregistré.", "Panel guardado."],
  saveError: ["Could not save your layout. Try again.", "Nou pa t ka anrejistre aranjman an. Eseye ankò.", "Impossible d’enregistrer la disposition. Réessayez.", "No se pudo guardar el diseño. Inténtalo de nuevo."],
  loading: ["Preparing your dashboard…", "N ap prepare tablodbò ou a…", "Préparation de votre tableau de bord…", "Preparando tu panel…"],
  statHidden: ["Community figures are hidden to protect small groups.", "Chif kominote yo kache pou pwoteje ti gwoup yo.", "Les chiffres sont masqués pour protéger les petits groupes.", "Las cifras se ocultan para proteger a los grupos pequeños."],
  personalUnavailable: ["Your community totals are temporarily unavailable.", "Kantite ou yo pa disponib pou kounye a.", "Vos chiffres communautaires sont temporairement indisponibles.", "Tus cifras comunitarias no están disponibles temporalmente."],
  registered: ["Members", "Manm", "Membres", "Miembros"],
  haiti: ["In Haiti", "Ann Ayiti", "En Haïti", "En Haití"],
  diaspora: ["In the diaspora", "Nan dyaspora a", "Dans la diaspora", "En la diáspora"],
  platform: ["Platform update", "Nouvèl platfòm nan", "Actualité de la plateforme", "Actualización de la plataforma"],
  feature: ["New feature", "Nouvo fonksyon", "Nouvelle fonctionnalité", "Nueva función"],
  notice: ["Important notice", "Avi enpòtan", "Avis important", "Aviso importante"],
  initiative: ["Community initiative", "Inisyativ kominote a", "Initiative communautaire", "Iniciativa comunitaria"],
  maintenance: ["Maintenance", "Antretyen", "Maintenance", "Mantenimiento"],
  deadline: ["Deadline", "Dènye dat", "Date limite", "Fecha límite"],
} as const;
const localePosition = { en: 0, ht: 1, fr: 2, es: 3 } as const;
type Label = keyof typeof words;
const box = "min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5";
const linkBox = box + " block hover:border-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2";

export function Dashboard() {
  const [locale] = useLocale();
  const text = (key: Label) => words[key][localePosition[locale]];
  const impactText = impactCopy(locale);
  const router = useRouter();
  const { claims, founderVerified } = useMemberIdentity();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityDiscoveryPage | null>(null);
  const [impact, setImpact] = useState<ImpactResponse | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [platformStats, setPlatformStats] = useState<{ registered: number | null; haiti: number | null; diaspora: number | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<DashboardSection[]>([...dashboardSections]);
  const [hidden, setHidden] = useState<DashboardSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const number = new Intl.NumberFormat(locale === "ht" ? "ht-HT" : locale);
  const date = (value: string, style: "long" | "medium" = "medium") =>
    new Intl.DateTimeFormat(locale === "ht" ? "ht-HT" : locale, { dateStyle: style, timeStyle: style === "long" ? undefined : "short" }).format(new Date(value));

  useEffect(() => {
    const controller = new AbortController();
    fetchMyProfile(controller.signal).then((member) => {
      if (!member.experience?.applies && (!member.displayName || ((member.onboardingStep ?? 0) > 0 && member.onboardingStep !== 4))) {
        router.replace("/onboarding"); return;
      }
      setProfile(member);
    }).catch(() => { if (!controller.signal.aborted) router.replace("/login"); });
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    loadDashboardSummary(controller.signal).then((value) => {
      setSummary(value);
      setOrder(value.preferences?.order ?? value.settings.defaultOrder);
      setHidden(value.preferences?.hidden ?? value.settings.defaultHidden);
      setSummaryError(false);
    }).catch(() => { if (!controller.signal.aborted) setSummaryError(true); });
    loadUnreadCount(controller.signal).then((value) => setUnread(value.count)).catch(() => {});
    return () => controller.abort();
  }, [profile]);

  useEffect(() => {
    if (!summary) return;
    const controller = new AbortController();
    const visible = (section: DashboardSection) => summary.settings.available.includes(section) && !hidden.includes(section);
    if (visible("events")) loadDashboardEvents(controller.signal).then(setEvents).catch(() => {});
    if (visible("projects")) loadDashboardProjects(controller.signal).then(setProjects).catch(() => {});
    if (visible("opportunities")) loadDashboardOpportunities(controller.signal).then(setOpportunities).catch(() => {});
    if (visible("impact")) loadDashboardImpact(controller.signal).then(setImpact).catch(() => {});
    if (visible("statistics") && summary.settings.statisticsEnabled) publicRequest("/api/v1/homepage/community-statistics", { signal: controller.signal })
      .then((value: { stats: typeof platformStats }) => setPlatformStats(value.stats)).catch(() => {});
    return () => controller.abort();
  }, [summary, hidden]);

  useEffect(() => {
    if (!editing || !summary) return;
    const controller = new AbortController();
    if (summary.settings.available.includes("opportunities") && !opportunities)
      loadDashboardOpportunities(controller.signal).then(setOpportunities).catch(() => {});
    if (summary.settings.available.includes("impact") && !impact)
      loadDashboardImpact(controller.signal).then(setImpact).catch(() => {});
    return () => controller.abort();
  }, [editing, summary, opportunities, impact]);

  async function save() {
    if (!summary || saving) return;
    setSaving(true); setSaveMessage("");
    try {
      const saved = await saveDashboardPreferences(summary.preferences?.version ?? 0, order, hidden, crypto.randomUUID());
      setSummary({ ...summary, preferences: saved });
      setSaveMessage(text("savedLayout")); setEditing(false);
    } catch { setSaveMessage(text("saveError")); }
    finally { setSaving(false); }
  }
  function move(section: DashboardSection, delta: number) {
    const index = order.indexOf(section), next = index + delta;
    if (next < 0 || next >= order.length) return;
    const updated = [...order]; [updated[index], updated[next]] = [updated[next], updated[index]];
    setOrder(updated);
  }
  const limit = summary?.settings.itemLimit ?? 3;
  const visible = (section: DashboardSection) => !!summary?.settings.available.includes(section) && !hidden.includes(section);
  const sections = (summary ? order.filter(visible) : [] as DashboardSection[])
    .filter((section) => section !== "opportunities" || opportunities?.state === "available")
    .filter((section) => section !== "impact" || impact?.state === "available")
    .filter((section) => section !== "statistics" || !!platformStats);
  const quickLinks = [
    ["/feed", text("feed")], ["/discover", text("discover")], ["/communities", text("communitiesLink")],
    ["/communities?category=interest", text("groupsLink")], ["/institutions", text("organizations")], ["/projects", text("projectsLink")],
    ["/events", text("eventsLink")], ["/projects/manage", text("proposals")],
    ...(opportunities?.state === "available" ? [["/opportunities", text("opportunities")]] : []),
    ...(impact?.state === "available" ? [["/impact", text("impact")]] : []),
  ];
  return <MemberShell><div className="grid min-w-0 gap-5 pb-8">
    {!profile ? <p role="status" className={box}>{text("loading")}</p> : <>
      <header className={box + " flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6"}>
        <div className="flex min-w-0 items-center gap-4">
          {profile.avatarUrl ? <Image src={profile.avatarUrl} alt="" width={80} height={80} unoptimized className="size-16 shrink-0 rounded-lg object-cover sm:size-20" />
            : <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-lg bg-[var(--theme-control)] text-2xl font-semibold sm:size-20">{profile.displayName?.slice(0,1).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-link)]"><time dateTime={new Date().toISOString()}>{date(new Date().toISOString(), "long")}</time></p>
            <h1 className="mt-1 break-words text-2xl font-semibold sm:text-3xl" dir="auto">{authMessages[locale].dashboardTitle.replace("{name}",profile.displayName ?? "")}</h1>
            <p className="mt-1 text-sm text-[var(--theme-body)]">{text("intro")}</p>
            <div className="mt-2 flex gap-2"><PersonalClaimChecks claims={claims} />{founderVerified && <FounderVerifiedMark />}</div>
          </div>
        </div>
        {summary && <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}
          className="min-h-10 rounded-lg border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)]">{text("customize")}</button>}
      </header>

      {editing && summary && <section className={box + " grid gap-3"} aria-label={text("customize")}>
        <h2 className="text-lg font-semibold">{text("customize")}</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{order.filter((section) => summary.settings.available.includes(section)
          && (section !== "opportunities" || opportunities?.state === "available")
          && (section !== "impact" || impact?.state === "available")
          && (section !== "statistics" || summary.settings.statisticsEnabled)).map((section) => <div key={section}
          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] p-2 text-sm">
          <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={!hidden.includes(section)}
            onChange={() => setHidden(hidden.includes(section) ? hidden.filter((item) => item !== section) : [...hidden,section])} />{text(section)}</label>
          <div className="flex gap-1"><button type="button" aria-label={`${text("up")}: ${text(section)}`} disabled={order.indexOf(section)===0}
            onClick={() => move(section,-1)} className="rounded border border-[var(--theme-border)] px-2 py-1 disabled:opacity-40">↑</button>
            <button type="button" aria-label={`${text("down")}: ${text(section)}`} disabled={order.indexOf(section)===order.length-1}
              onClick={() => move(section,1)} className="rounded border border-[var(--theme-border)] px-2 py-1 disabled:opacity-40">↓</button></div>
        </div>)}</div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save()}
          className="min-h-10 rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-on-primary)] disabled:opacity-50">{text("saveLayout")}</button>
          <button type="button" disabled={saving} onClick={() => { setOrder(summary.settings.defaultOrder); setHidden(summary.settings.defaultHidden); }}
            className="min-h-10 rounded-lg border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold">{text("restore")}</button></div>
      </section>}
      {saveMessage && <p role="status" className="text-sm">{saveMessage}</p>}

      <section aria-label={text("personal")} className="grid gap-3"><h2 className="text-xl font-semibold">{text("personal")}</h2>
        {summary ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{([
          ["followers", summary.counts.followers, profile.username ? `/members/${profile.username}` : "/profile"],
          ["following", summary.counts.following, "/discover?view=following"],
          ["joined", summary.counts.communities, "/communities?category=mine"],
          ["groups", summary.counts.groups, "/communities?category=interest"],
          ["saved", summary.counts.savedPosts, "/feed/saved"],
        ] as const).map(([label,value,href]) => <Link key={label} href={href} className={linkBox}>
          <span className="block text-sm text-[var(--theme-body)]">{text(label)}</span><strong className="mt-1 block text-2xl tabular-nums">{number.format(value)}</strong></Link>)}</div>
          : summaryError ? <p className="text-sm text-[var(--theme-body)]">{text("personalUnavailable")}</p>
          : <p role="status" className={box}>{text("loading")}</p>}
      </section>

      {unread != null && unread > 0 && <section aria-label={text("attention")} className="grid gap-3">
        <h2 className="text-xl font-semibold">{text("attention")}</h2><Link href="/notifications" className={linkBox}>
          {text("notifications")} <strong className="float-end tabular-nums">{number.format(unread)}</strong></Link></section>}

      <section aria-label={text("explore")} className="grid gap-3"><h2 className="text-xl font-semibold">{text("explore")}</h2>
        <nav className="flex flex-wrap gap-2" aria-label={text("explore")}>{quickLinks.map(([href,label]) => <Link key={href} href={href}
          className="inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)]">{label} <span aria-hidden="true" className="ms-2">↗</span></Link>)}</nav></section>

      {!!summary?.announcements.length && <section aria-label={text("announcements")} className="grid gap-3"><h2 className="text-xl font-semibold">{text("announcements")}</h2>
        {summary.announcements.map((announcement) => <article key={announcement.id} className={box}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-link)]">{text(announcement.category as Label)} · {date(announcement.publishedAt)}</p>
          <h3 className="mt-1 text-lg font-semibold" dir="auto">{announcement.title[locale] ?? announcement.title.en}</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-6" dir="auto">{announcement.body[locale] ?? announcement.body.en}</p>
        </article>)}</section>}

      {sections.map((section) => <section key={section} aria-label={text(section)} className="grid gap-3"><div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{text(section)}</h2><Link href={section === "statistics" ? "/" : section === "communities" ? "/communities" : `/${section}`}
          className="text-sm font-semibold text-[var(--theme-link)] hover:underline">{text("browse")}</Link></div>
        {section === "events" && (events?.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[...events].sort((a,b) => Number(b.response === "going") - Number(a.response === "going") || a.startsAt.localeCompare(b.startsAt))
            .slice(0,limit).map((event) => <Link key={event.id} href={`/events/${event.id}`} className={linkBox}>
              <h3 className="font-semibold" dir="auto">{event.title}</h3><p className="mt-2 text-sm text-[var(--theme-body)]">{date(event.startsAt)} · {event.format.replaceAll("_"," ")}</p>
              <p className="mt-1 text-sm" dir="auto">{event.organizer.name}{event.locality ? ` · ${event.locality}` : ""}</p></Link>)}</div>
          : <p className={box + " text-sm text-[var(--theme-body)]"}>{text("eventEmpty")}</p>)}
        {section === "projects" && (projects?.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[...projects].sort((a,b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
            .slice(0,limit).map((project) => <Link key={project.id} href={`/projects/${project.id}`} className={linkBox}>
              <h3 className="font-semibold" dir="auto">{project.title}</h3><p className="mt-2 text-sm text-[var(--theme-body)]">{project.category}{project.owner.name || project.owner.handle ? ` · ${project.owner.name ?? project.owner.handle}` : ""}</p>
              <p className="mt-1 text-sm">{project.department ?? project.country} · {project.status}</p></Link>)}</div>
          : <p className={box + " text-sm text-[var(--theme-body)]"}>{text("projectEmpty")}</p>)}
        {section === "communities" && (summary?.joined.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {summary.joined.slice(0,limit).map((community) => <Link key={community.slug} href={`/communities/${community.slug}`}
            className={linkBox + " font-semibold"} dir="auto">{community.name}</Link>)}</div>
          : <p className={box + " text-sm text-[var(--theme-body)]"}>{text("communityEmpty")}</p>)}
        {section === "opportunities" && opportunities?.state === "available" && <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {opportunities.items.filter((item) => !("unavailable" in item)).slice(0,limit).map((item) => "snapshot" in item && <Link key={item.id} href="/opportunities"
            className={linkBox}><h3 className="font-semibold" dir="auto">{item.snapshot.title}</h3>
            <p className="mt-2 text-sm text-[var(--theme-body)]">{item.snapshot.type} · {item.organization} · {item.snapshot.mode}</p>
            <p className="mt-1 text-sm">{item.snapshot.department ?? item.snapshot.country}{item.snapshot.closesOn ? ` · ${text("deadline")}: ${date(item.snapshot.closesOn)}` : ""}</p></Link>)}</div>}
        {section === "impact" && impact?.state === "available" && <div className="grid gap-2 sm:grid-cols-3">
          {impactIndicators.slice(0,3).map((key) => {
            const value = impact.report[key]; return <div key={key} className={box}><span className="text-sm">{impactText(key)}</span>
              <strong className="mt-2 block text-xl">{value.state === "available" ? number.format(value.value) : "—"}</strong></div>;
          })}</div>}
        {section === "statistics" && platformStats && <div className="grid gap-2 sm:grid-cols-3">
          {(["registered","haiti","diaspora"] as const).filter((key) => platformStats[key] != null).map((key) => <div key={key} className={box}>
            <span className="text-sm">{text(key)}</span><strong className="mt-2 block text-xl tabular-nums">{number.format(platformStats[key]!)}</strong></div>)}
          {[platformStats.registered,platformStats.haiti,platformStats.diaspora].every((value) => value == null) && <p className="text-sm">{text("statHidden")}</p>}</div>}
      </section>)}
    </>}
  </div></MemberShell>;
}
