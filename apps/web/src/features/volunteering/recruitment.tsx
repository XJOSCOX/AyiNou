"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchingCopy } from "@/lib/matching-i18n";
import { useCallback, useRef, useState } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberSafetyControls } from "@/components/member-safety";
import { MemberShell } from "@/components/member-shell";
import { ProjectReportForm } from "@/components/project-report-form";
import { ProjectLoading } from "@/components/project-ui";
import { RequirementPreview } from "@/features/projects/work/requirements";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { changeRecruitmentConsent, changeRecruitmentInvitation, loadRecruitmentInbox, loadRecruitmentInvitation,
  loadRecruitmentPreferences, loadRecruitmentSent, previewRecruitment, recruitmentPath, sendRecruitment } from "@/lib/recruitment-api";
import { recruitmentCopy } from "@/lib/recruitment-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { useRevalidateMatching } from "./recommendations";

const button = institutionLink + " min-h-10 w-fit";
const panel = institutionCard + " grid min-w-0 gap-3 p-4";

export function RecruitmentContact() {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale);
  const resource = useInstitutionResource(loadRecruitmentPreferences);
  const mutation = useFeedMutation();
  const data = resource.data;
  const update = async (allowed: boolean) => {
    if (data?.state !== "ready") return;
    if (await mutation.run(() => changeRecruitmentConsent(JSON.stringify({ allowed, expectedVersion: data.version, requestId: crypto.randomUUID() })))) {
      resource.refresh();
    }
  };
  return <section className={panel}>
    <h2 className="font-semibold">{t("preferences")}</h2>
    <p className="text-sm">{t("consentHelp")}</p>
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    {data?.state === "closed" && <p>{t("closed")}</p>}
    {data?.state === "ready" && <label className="flex min-h-10 items-center gap-2">
      <input type="checkbox" disabled={!data.hasProfile || mutation.busy} checked={data.allowed}
        onChange={(event) => { void update(event.target.checked); }} />{t("consent")}
    </label>}
  </section>;
}

export function InvitationList({ project, opportunity }: { project?: string; opportunity?: string }) {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale);
  const [cursor, setCursor] = useState("");
  const load = useCallback((signal: AbortSignal) => project && opportunity
    ? loadRecruitmentSent(project, opportunity, cursor, signal)
    : loadRecruitmentInbox(cursor, signal), [project, opportunity, cursor]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  useRevalidateMatching(resource.refresh, data?.state === "ready");
  return <div className="grid min-w-0 gap-2">
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={() => { setCursor(""); resource.refresh(); }} signIn />}
    {data?.state === "closed" && <p role="status">{t("closed")}</p>}
    {data?.state === "ready" && <>
      {!data.items.length ? <p>{t("empty")}</p> : <ul className="grid gap-2">
        {data.items.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] p-3">
          <div className="min-w-0 break-words">
            {item.title && <p className="font-semibold" dir="auto">{item.title}</p>}
            {item.name && <p dir="auto">{item.name}</p>}
            <p>{t(item.status)}</p>
          </div>
          <Link className={button} href={recruitmentPath + "/" + item.id}>{t("open")}</Link>
        </li>)}
      </ul>}
      {data.nextCursor && <button className={button} type="button" onClick={() => setCursor(data.nextCursor ?? "")}>
        {matchingCopy(locale)("next")}
      </button>}
    </>}
  </div>;
}

export function InvitationComposer({ project, opportunity, selection, close, onSent }: {
  project: string; opportunity: string; selection: string; close: () => void; onSent: () => void;
}) {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale);
  const mutation = useFeedMutation();
  const receipt = useRef<{ message: string; requestId: string }>(null);
  const load = useCallback((signal: AbortSignal) => previewRecruitment(project, opportunity, selection, signal), [project, opportunity, selection]);
  const resource = useInstitutionResource(load);
  const terms = resource.data;
  return <div className={panel}>
    <button className={button} type="button" onClick={close}>{t("close")}</button>
    {!terms && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <p role="status">{t("unavailable")}</p>}
    {terms && <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const message = String(new FormData(event.currentTarget).get("message") ?? "").trim();
      if (!message) return;
      if (receipt.current?.message !== message) receipt.current = { message, requestId: crypto.randomUUID() };
      const body = JSON.stringify({ ...receipt.current, expectedVersion: 0, selection });
      void mutation.run(() => sendRecruitment(project, opportunity, body)).then(saved => { if (saved) onSent(); });
    }}>
      <div><h4 className="font-semibold" dir="auto">{terms.title}</h4><p dir="auto">{terms.projectTitle}</p></div>
      <RequirementPreview revision={{ ...terms, version: terms.revision }} locale={locale} />
      <label>{t("message")}<textarea className={institutionField} name="message" minLength={1} maxLength={400} rows={3} required /></label>
      <p className="text-sm">{t("helpMessage")}</p>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <button className={institutionAction + " w-fit"} disabled={mutation.busy}>{t("send")}</button>
    </form>}
  </div>;
}

export function RecruitmentInboxScreen() {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale);
  return <MemberShell><section className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h1 className="text-3xl font-bold">{t("title")}</h1><p>{t("intro")}</p></div>
      <Link className={button} href="/settings/volunteering">{t("preferences")}</Link>
    </div>
    <InvitationList />
  </section></MemberShell>;
}

export function RecruitmentInvitationScreen({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale);
  const router = useRouter();
  const mutation = useFeedMutation();
  const [revalidating, setRevalidating] = useState(false);
  const [changed, setChanged] = useState(false);
  const load = useCallback((signal: AbortSignal) => loadRecruitmentInvitation(id, signal).finally(() => {
    if (!signal.aborted) setRevalidating(false);
  }), [id]);
  const current = useInstitutionResource(load);
  const refresh = () => { setRevalidating(true); current.refresh(); };
  useRevalidateMatching(refresh, current.data?.state === "ready");
  const item = revalidating || current.error !== null ? null : current.data;
  const act = async (action: "decline" | "withdraw" | "dismiss") => {
    if (item?.state !== "ready") return;
    if (await mutation.run(() => changeRecruitmentInvitation(id, JSON.stringify({ action, expectedVersion: item.version, requestId: crypto.randomUUID() })))) {
      setChanged(true);
      if (action === "dismiss") router.replace(recruitmentPath);
      else refresh();
    }
  };
  return <MemberShell><section className={panel}>
    <header className="flex flex-wrap justify-between gap-2">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <Link href={recruitmentPath} className={button}>{t("title")}</Link>
    </header>
    {!item && current.error === null && <ProjectLoading />}
    {current.error !== null && <ApiErrorNotice error={current.error} retry={refresh} signIn />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    {changed && <p role="status">{t("stateChanged")}</p>}
    {item?.state === "closed" && <p role="status">{t("closed")}</p>}
    {item?.state === "ready" && <>
      <p role="status">{t(item.status)}</p>
      {item.terms && item.project && item.opportunity && <>
        <div><h2 className="text-xl font-semibold" dir="auto">{item.terms.title}</h2><p dir="auto">{item.terms.projectTitle}</p></div>
        {item.recipient && <p>{t("organizer")} · <bdi>{item.name ?? item.handle}</bdi></p>}
        <p>{t("expires")} · <time dateTime={item.expiresAt}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(item.expiresAt))}</time></p>
        <RequirementPreview revision={{ ...item.terms, version: item.terms.revision }} locale={locale} />
        <p className="break-words whitespace-pre-line" dir="auto">{item.message}</p>
        {item.recipient ? <>
          <p>{t("offerHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <Link className={institutionAction} href={`/projects/${item.project}/work?section=volunteers#opportunity-${item.opportunity}`}>{t("apply")}</Link>
            <button className={button} type="button" disabled={mutation.busy} onClick={() => { void act("decline"); }}>{t("decline")}</button>
          </div>
          <p className="text-sm">{t("declineHelp")}</p>
          {item.handle && <MemberSafetyControls username={item.handle} collapsible />}
        </> : <button className={button} type="button" disabled={mutation.busy} onClick={() => { void act("withdraw"); }}>{t("withdraw")}</button>}
      </>}
      {item.recipient && <>
        {item.reported ? <p role="status">{projectMessages[locale].reported}</p>
          : <ProjectReportForm title={t("report")} submitReport={async (category, explanation) => {
            await changeRecruitmentInvitation(id, JSON.stringify({ action: "report", category, explanation,
              expectedVersion: item.version, requestId: crypto.randomUUID() }));
            refresh();
          }} />}
        <button className={button} type="button" disabled={mutation.busy} onClick={() => { void act("dismiss"); }}>{t("dismiss")}</button>
      </>}
    </>}
  </section></MemberShell>;
}
