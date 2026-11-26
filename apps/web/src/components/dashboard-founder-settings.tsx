"use client";

import { useEffect, useState } from "react";
import { authorizedRequest } from "@/lib/api";
import { dashboardSections, type DashboardSection } from "@/lib/dashboard-api";
import { useLocale } from "@/lib/locale-store";

type Announce = { id: string; category: string; title: Record<string,string>; body: Record<string,string>;
  publishedAt: string; expiresAt: string; withdrawnAt: string | null; version: number };
type Setting = { revision: number; available: DashboardSection[]; defaultOrder: DashboardSection[];
  defaultHidden: DashboardSection[]; itemLimit: number; announcementsEnabled: boolean;
  statisticsEnabled: boolean; featuredPolicy: "latest"; announcements: Announce[] };
const labels = {
  title: ["Dashboard settings","Paramèt tablodbò","Paramètres du tableau de bord","Configuración del panel"],
  intro: ["Choose the sections members may use. Member preferences and consent remain in control.","Chwazi seksyon manm yo ka itilize. Preferans ak konsantman manm yo rete an vigè.","Choisissez les sections accessibles aux membres. Leurs préférences et consentements restent valables.","Elige las secciones disponibles para los miembros. Se respetan sus preferencias y consentimiento."],
  controls: ["Member dashboard","Tablodbò manm","Tableau de bord des membres","Panel de miembros"],
  available: ["Available sections","Seksyon ki disponib","Sections disponibles","Secciones disponibles"],
  defaultHidden: ["Hidden by default","Kache pa defo","Masquées par défaut","Ocultas por defecto"],
  max: ["Items per section","Atik pa seksyon","Éléments par section","Elementos por sección"],
  notices: ["Official announcements","Anons ofisyèl","Annonces officielles","Anuncios oficiales"],
  statistics: ["Platform statistics","Estatistik platfòm nan","Statistiques de la plateforme","Estadísticas de la plataforma"],
  reason: ["Reason for this change","Rezon chanjman sa a","Raison de cette modification","Motivo de este cambio"],
  confirm: ["Confirm this protected change","Konfime chanjman pwoteje sa a","Confirmer cette modification protégée","Confirmar este cambio protegido"],
  save: ["Save settings","Anrejistre paramèt yo","Enregistrer les paramètres","Guardar configuración"],
  publish: ["Publish announcement","Pibliye anons lan","Publier l’annonce","Publicar anuncio"],
  withdraw: ["Withdraw","Retire","Retirer","Retirar"],
  expired: ["Expired or withdrawn","Ekspire oswa retire","Expirée ou retirée","Vencido o retirado"],
  category: ["Category","Kategori","Catégorie","Categoría"],
  start: ["Publish at","Pibliye lè","Publier le","Publicar el"],
  end: ["Expires at","Ekspire lè","Expire le","Vence el"],
  noticeTitle: ["Title","Tit","Titre","Título"],
  body: ["Message","Mesaj","Message","Mensaje"],
  saved: ["Changes saved.","Chanjman yo anrejistre.","Modifications enregistrées.","Cambios guardados."],
  error: ["Could not complete this request. Refresh and try again.","Nou pa t ka fini demann sa a. Rafrechi paj la epi eseye ankò.","Impossible de terminer cette demande. Actualisez et réessayez.","No se pudo completar. Actualiza e inténtalo de nuevo."],
  events: ["Events","Evènman","Événements","Eventos"],
  projects: ["Projects","Pwojè","Projets","Proyectos"],
  communities: ["Communities","Kominote","Communautés","Comunidades"],
  opportunities: ["Opportunities","Opòtinite","Occasions","Oportunidades"],
  impact: ["Impact","Enpak","Impact","Impacto"],
  up: ["Move up","Monte","Monter","Subir"],
  down: ["Move down","Desann","Descendre","Bajar"],
  platform: ["Platform update","Nouvèl platfòm nan","Actualité de la plateforme","Actualización de la plataforma"],
  feature: ["New feature","Nouvo fonksyon","Nouvelle fonctionnalité","Nueva función"],
  notice: ["Important notice","Avi enpòtan","Avis important","Aviso importante"],
  initiative: ["Community initiative","Inisyativ kominote a","Initiative communautaire","Iniciativa comunitaria"],
  maintenance: ["Maintenance","Antretyen","Maintenance","Mantenimiento"],
  cancel: ["Cancel","Anile","Annuler","Cancelar"],
} as const;
const language = { en:0, ht:1, fr:2, es:3 } as const;
type Label = keyof typeof labels;
const languages = ["en","ht","fr","es"] as const;
const border = "rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5";

export function DashboardFounderSettings({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = (key: Label) => labels[key][language[locale]];
  const [data, setData] = useState<Setting | null>(null);
  const [available, setAvailable] = useState<DashboardSection[]>([]);
  const [hidden, setHidden] = useState<DashboardSection[]>([]);
  const [order, setOrder] = useState<DashboardSection[]>([...dashboardSections]);
  const [limit, setLimit] = useState(3);
  const [notices, setNotices] = useState(true);
  const [statistics, setStatistics] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [noticeReason, setNoticeReason] = useState("");
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);
  const [category, setCategory] = useState("platform");
  const [title, setTitle] = useState<Record<string,string>>({en:"",ht:"",fr:"",es:""});
  const [body, setBody] = useState<Record<string,string>>({en:"",ht:"",fr:"",es:""});
  const [publishedAt, setPublishedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const request = (method = "GET", input?: object) => authorizedRequest("/api/v1/admin/dashboard-settings", {
    method, headers: { "X-Ayinou-Workspace": workspaceId }, cache: "no-store",
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  async function refresh() {
    const response = await request() as Setting;
    setData(response); setAvailable(response.available); setHidden(response.defaultHidden);
    setOrder(response.defaultOrder); setLimit(response.itemLimit);
    setNotices(response.announcementsEnabled); setStatistics(response.statisticsEnabled);
  }
  useEffect(() => {
    void authorizedRequest("/api/v1/admin/dashboard-settings", {
      headers: { "X-Ayinou-Workspace": workspaceId }, cache: "no-store",
    }).then((response) => {
      const settings = response as Setting;
      setData(settings); setAvailable(settings.available); setHidden(settings.defaultHidden);
      setOrder(settings.defaultOrder); setLimit(settings.itemLimit);
      setNotices(settings.announcementsEnabled); setStatistics(settings.statisticsEnabled);
    }).catch(() => setMessage(labels.error[language[locale]]));
  }, [workspaceId, locale]);
  function move(section: DashboardSection, shift: number) {
    const from = order.indexOf(section), to = from + shift;
    if (to < 0 || to >= order.length) return;
    const next = [...order]; [next[from],next[to]] = [next[to],next[from]]; setOrder(next);
  }
  async function update(input: object) {
    setBusy(true); setMessage("");
    try { await request("PATCH",input); await refresh(); setMessage(t("saved")); setReason("");
      setNoticeReason(""); setConfirmed(false); setNoticeConfirmed(false); return true; }
    catch { setMessage(t("error")); return false; }
    finally { setBusy(false); }
  }
  return <div className="grid min-w-0 gap-4">
    <header className={border}><h2 className="text-2xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-[var(--theme-body)]">{t("intro")}</p></header>
    {!data ? <p role="status" className={border}>{message || "…"}</p> : <>
      <div className={border + " grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}>
        <div><h3 className="text-lg font-semibold">{t("controls")}</h3><p className="mt-2 text-sm text-[var(--theme-body)]">{t("intro")}</p></div>
        <div className="grid gap-4">
          <div><h4 className="font-semibold">{t("available")}</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{dashboardSections.map((section) => <div key={section}
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] p-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={available.includes(section)}
              onChange={() => { setAvailable(available.includes(section) ? available.filter((item) => item!==section) : [...available,section]);
                setHidden(hidden.filter((item) => item!==section)); }} />{t(section)}</label>
            <div className="flex gap-1"><button type="button" aria-label={`${t("up")}: ${t(section)}`} onClick={() => move(section,-1)} disabled={order.indexOf(section)===0}>↑</button>
              <button type="button" aria-label={`${t("down")}: ${t(section)}`} onClick={() => move(section,1)} disabled={order.indexOf(section)===order.length-1}>↓</button></div></div>)}</div></div>
          <fieldset><legend className="font-semibold">{t("defaultHidden")}</legend><div className="mt-2 flex flex-wrap gap-3">{available.map((section) =>
            <label key={section} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hidden.includes(section)}
              onChange={() => setHidden(hidden.includes(section) ? hidden.filter((item) => item!==section) : [...hidden,section])} />{t(section)}</label>)}</div></fieldset>
          <label className="grid gap-1 text-sm font-semibold">{t("max")}<input type="number" min={2} max={6} value={limit}
            onChange={(event) => setLimit(Number(event.target.value))} className="w-28 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notices} onChange={() => setNotices(!notices)} />{t("notices")}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={statistics} onChange={() => setStatistics(!statistics)} />{t("statistics")}</label>
          <label className="grid gap-1 text-sm font-semibold">{t("reason")}<textarea value={reason} onChange={(event) => setReason(event.target.value)}
            maxLength={500} rows={2} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={() => setConfirmed(!confirmed)} />{t("confirm")}</label>
          <button type="button" disabled={busy || !confirmed || reason.trim().length<10 || available.length===0 || !Number.isInteger(limit) || limit<2 || limit>6}
            onClick={() => void update({ action:"configure", expectedVersion:data.revision,requestId:crypto.randomUUID(),reason:reason.trim(),confirmed:true,
              available,defaultOrder:order,defaultHidden:hidden,itemLimit:limit,announcementsEnabled:notices,statisticsEnabled:statistics,featuredPolicy:"latest" })}
            className="w-fit rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-on-primary)] disabled:opacity-50">{t("save")}</button>
        </div>
      </div>
      <section className={border + " grid gap-4"}><h3 className="text-lg font-semibold">{t("notices")}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <label className="grid gap-1 text-sm">{t("category")}<select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[var(--theme-border)] p-2">
              {(["platform","feature","notice","initiative","maintenance"] as const).map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label>
            {languages.map((lang) => <div key={lang} className="grid gap-2 rounded-lg border border-[var(--theme-border)] p-3">
              <h4 className="font-semibold uppercase">{lang}</h4><label className="grid gap-1 text-sm">{t("noticeTitle")}
                <input value={title[lang]} onChange={(event) => setTitle({...title,[lang]:event.target.value})} maxLength={120} className="rounded border border-[var(--theme-border)] p-2" /></label>
              <label className="grid gap-1 text-sm">{t("body")}<textarea value={body[lang]} onChange={(event) => setBody({...body,[lang]:event.target.value})}
                rows={3} maxLength={2000} className="rounded border border-[var(--theme-border)] p-2" /></label></div>)}
            <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-sm">{t("start")}
              <input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="rounded border border-[var(--theme-border)] p-2" /></label>
              <label className="grid gap-1 text-sm">{t("end")}
                <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="rounded border border-[var(--theme-border)] p-2" /></label></div>
            <label className="grid gap-1 text-sm">{t("reason")}<textarea value={noticeReason} onChange={(event) => setNoticeReason(event.target.value)} rows={2} className="rounded border border-[var(--theme-border)] p-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noticeConfirmed} onChange={() => setNoticeConfirmed(!noticeConfirmed)} />{t("confirm")}</label>
            <button type="button" disabled={busy || !noticeConfirmed || noticeReason.trim().length<10 || !publishedAt || !expiresAt ||
              languages.some((lang) => title[lang].trim().length<3 || body[lang].trim().length<10)}
              onClick={() => void update({action:"publish",expectedVersion:0,requestId:crypto.randomUUID(),reason:noticeReason.trim(),confirmed:true,
                category,title,body,publishedAt:new Date(publishedAt).toISOString(),expiresAt:new Date(expiresAt).toISOString()})}
              className="w-fit rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-on-primary)] disabled:opacity-50">{t("publish")}</button>
          </div>
          <div className="grid content-start gap-2">{data.announcements.map((notice) => <article key={notice.id} className="rounded-lg border border-[var(--theme-border)] p-3">
            <h4 className="font-semibold" dir="auto">{notice.title[locale] ?? notice.title.en}</h4>
            <p className="mt-1 text-sm text-[var(--theme-body)]">{t(notice.category as Label)} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(notice.publishedAt))}</p>
            {notice.withdrawnAt || new Date(notice.expiresAt) < new Date() ? <p className="mt-2 text-sm">{t("expired")}</p>
              : withdrawId === notice.id ? <div className="mt-3 grid gap-2">
                <label className="grid gap-1 text-sm">{t("reason")}<textarea value={withdrawReason} rows={2} maxLength={500}
                  onChange={(event) => setWithdrawReason(event.target.value)} className="rounded border border-[var(--theme-border)] p-2" /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withdrawConfirmed}
                  onChange={() => setWithdrawConfirmed(!withdrawConfirmed)} />{t("confirm")}</label>
                <div className="flex gap-2"><button type="button" disabled={busy || !withdrawConfirmed || withdrawReason.trim().length<10}
                  onClick={() => void update({action:"withdraw",expectedVersion:notice.version,requestId:crypto.randomUUID(),
                    reason:withdrawReason.trim(),confirmed:true,id:notice.id}).then((saved) => {
                      if (saved) {setWithdrawId(null);setWithdrawReason("");setWithdrawConfirmed(false);}
                    })}
                  className="rounded bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-on-primary)] disabled:opacity-50">{t("withdraw")}</button>
                  <button type="button" onClick={() => setWithdrawId(null)} className="rounded border border-[var(--theme-border)] px-3 py-1.5 text-sm">{t("cancel")}</button></div>
              </div> : <button type="button" disabled={busy} onClick={() => {setWithdrawId(notice.id);setWithdrawReason("");setWithdrawConfirmed(false);}}
                className="mt-2 rounded border border-[var(--theme-border)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-link)]">{t("withdraw")}</button>}
          </article>)}</div>
        </div>
      </section>
      {message && <p role="status" className="text-sm">{message}</p>}
    </>}
  </div>;
}
