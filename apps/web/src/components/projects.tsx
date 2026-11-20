"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { interestCodes, projectReportCategories, type ProjectCard, type ProjectDetail } from "@ayinou/shared";
import { fetchDepartments } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { loadMyProjects, loadProject, loadProjectImage, loadProjectOptions, loadProjects, reportProject, submitProject, uploadProjectImage } from "@/lib/project-api";
import { projectMessages } from "@/lib/project-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { DisplayControls } from "./display-controls";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { ProjectForm, ProjectIdentityNotice } from "./project-form";
import { PublicProjectProgress } from "./project-progress";
import { ReviewActionForm } from "./project-review";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";

const fields = ["description", "problem", "solution", "objectives", "beneficiaries", "outcomes"] as const;

function ProjectShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  if (signedIn) return <MemberShell>{children}</MemberShell>;
  return <div id="top" className="flex min-h-dvh flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:px-8">
      <SiteBrand /><DisplayControls />
    </header>
    <main className="flex-1 px-4 py-5 sm:px-8 sm:py-8">{children}</main>
    <SiteFooter />
  </div>;
}

function ProjectTile({ item, restricted = false }: { item: ProjectCard; restricted?: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <li className={institutionCard}>
    <Link href={`/projects/${item.id}`} className={`${institutionLink} break-words text-base`} dir="auto">{item.title}</Link>
    <p className="mt-1 break-words text-sm text-[var(--theme-body)]">
      {restricted ? t.restricted : t.status[item.status]} · {membershipMessages[locale][item.category]}
      {item.owner?.name && ` · ${item.owner.name}`}
    </p>
  </li>;
}

export function ProjectsDirectory({ signedIn }: { signedIn: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const [filter, setFilter] = useState<Record<string, string>>({});
  const departments = useInstitutionResource(fetchDepartments);
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const response = await loadProjects(signedIn, filter, cursor, signal);
    return { rows: response.projects, nextCursor: response.nextCursor };
  }, [signedIn, filter]);
  const { page, error, retry, more, loadingMore } = useCursorPage(loader);
  return <ProjectShell signedIn={signedIn}><section className="grid gap-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-semibold sm:text-4xl">{t.title}</h1><p className="mt-2 max-w-prose">{t.discoveryHelp}</p></div>
      {signedIn && <div className="flex flex-wrap items-center gap-3">
        <Link href="/projects/new" className={institutionAction}>{t.newProject}</Link>
        <Link href="/projects/manage" className={institutionLink}>{t.manage}</Link>
        <Link href="/projects/team" className={institutionLink}>{projectWorkMessages[locale].workspace}</Link>
      </div>}
    </header>
    <form className={`${institutionCard} grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]`} onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      setFilter(Object.fromEntries(["category", "country", "department"].map((key) =>
        [key, String(values.get(key) ?? "").trim()]).filter(([, value]) => value)));
    }}>
      <label className="min-w-0 text-sm font-semibold">{t.category}
        <select name="category" className={institutionField}>
          <option value="">{t.all}</option>
          {interestCodes.map((key) => <option key={key} value={key}>{membershipMessages[locale][key]}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold">{t.country}
        <input name="country" maxLength={2} pattern="[A-Za-z]{2}" placeholder="HT" className={institutionField}
          onChange={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }} />
      </label>
      <label className="min-w-0 text-sm font-semibold">{t.department}
        <select name="department" className={institutionField} disabled={!departments.data}>
          <option value="">{t.all}</option>
          {departments.data?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </label>
      <button className={institutionAction}>{t.filter}</button>
    </form>
    {departments.error !== null && <ApiErrorNotice error={departments.error} retry={departments.refresh} />}
    {error !== null && <ApiErrorNotice error={error} retry={retry} signIn={signedIn} />}
    {!page && error === null && <p role="status">{authMessages[locale].working}</p>}
    {page?.rows.length === 0 && <p className={institutionCard}>{t.emptyDirectory}</p>}
    {!!page?.rows.length && <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{page.rows.map((row) => <ProjectTile key={row.id} item={row} />)}</ul>}
    {page?.nextCursor && <button className={`${institutionAction} justify-self-start`} type="button" disabled={loadingMore}
      onClick={() => { void more(); }}>{t.more}</button>}
  </section></ProjectShell>;
}

export function ManageProjectsScreen() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const resource = useInstitutionResource(loadMyProjects);
  const options = useInstitutionResource(loadProjectOptions);
  const mine = resource.data?.projects.filter((item) => item.createdByMe);
  const manage = resource.data?.projects.filter((item) => !item.createdByMe);
  return <MemberShell><section className="grid gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold">{t.manage}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/projects" className={institutionLink}>{t.title}</Link>
        <Link href="/projects/team" className={institutionLink}>{projectWorkMessages[locale].workspace}</Link>
        <Link href="/projects/new" className={institutionAction}>{t.newProject}</Link>
        {options.data?.canReview && <Link href="/projects/review" className={institutionLink}>{t.reviewQueue}</Link>}
      </div>
    </header>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {options.error !== null && <ApiErrorNotice error={options.error} retry={options.refresh} signIn />}
    {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {[{ title: t.mine, rows: mine }, { title: t.managed, rows: manage }].map(({ title, rows }) => rows && <section key={title}>
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      {rows.length ? <ul className="grid gap-3 md:grid-cols-2">{rows.map((item) => <ProjectTile key={item.id} item={item} restricted={item.restricted} />)}</ul>
        : <p className={institutionCard}>{t.emptyManage}</p>}
    </section>)}
  </section></MemberShell>;
}

export function ProjectDetailScreen({ id, signedIn }: { id: string; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const loader = useCallback((signal: AbortSignal) => loadProject(id, signedIn, signal), [id, signedIn]);
  const resource = useInstitutionResource(loader);
  const departments = useInstitutionResource(fetchDepartments);
  const data = resource.data;
  return <ProjectShell signedIn={signedIn}><div className="grid gap-4">
    <Link href="/projects" className={`${institutionLink} justify-self-start`}>{t.title}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn={signedIn} />}
    {!data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {data && <>
      <article className={`${institutionCard} grid min-w-0 gap-4`}>
        <header>
          <p className="text-sm font-semibold text-[var(--theme-link)]">{data.restricted ? t.restricted : t.status[data.status]}</p>
          <h1 dir="auto" className="mt-1 break-words text-3xl font-semibold sm:text-4xl">{data.title}</h1>
          <p className="mt-2 break-words text-sm">{t.owner} · {data.owner?.name ?? t.none} · {t.owners[data.owner.kind]}</p>
          {data.association && <p className="mt-1 break-words text-sm">{t.association} · {data.association.name}</p>}
          <p className="mt-1 text-sm text-[var(--theme-body)]">
            {[departments.data?.find((item) => item.code === data.department)?.name ?? data.department,
              new Intl.DisplayNames([locale], { type: "region" }).of(data.country), membershipMessages[locale][data.category]].filter(Boolean).join(" · ")}
          </p>
          {data.publishedAt && <p className="mt-1 text-sm">{t.published} · {new Date(data.publishedAt).toLocaleDateString(locale)}</p>}
        </header>
        {data.status === "approved" && <p className="max-w-prose text-sm text-[var(--theme-body)]">{t.approvalHelp}</p>}
        {signedIn && data.canOpenWork && <Link className={institutionLink} href={"/projects/" + id + "/work"}>
          {projectWorkMessages[locale].workspace}
        </Link>}
        {data.publicationEligibility === "pending_institution_verification" &&
          <p className="max-w-prose text-sm">{t.institutionVerificationPending}</p>}
        {data.publicationEligibility === "unavailable" && <p className="max-w-prose text-sm">{t.publicationUnavailable}</p>}
        {data.hasImage && <ProjectCover key={`${id}:${data.version ?? "published"}`} id={id} signedIn={signedIn} />}
        <dl className="grid gap-4 md:grid-cols-2">
          {fields.filter((key) => data.proposal[key]).map((key) => <div className="min-w-0" key={key}>
            <dt className="font-semibold">{t.fields[key]}</dt>
            <dd className="mt-1 whitespace-pre-line break-words" dir="auto">{data.proposal[key]}</dd>
          </div>)}
          {data.proposal.startDate && <div><dt className="font-semibold">{t.startDate}</dt><dd>{data.proposal.startDate}</dd></div>}
          {data.proposal.endDate && <div><dt className="font-semibold">{t.endDate}</dt><dd>{data.proposal.endDate}</dd></div>}
        </dl>
        {data.proposal.references.length > 0 && <section>
          <h2 className="font-semibold">{t.referencesTitle}</h2>
          <ul>{data.proposal.references.map((url) => <li className="break-all" key={url}>
            <a className={institutionLink} href={url} target="_blank" rel="noreferrer">{url}</a>
          </li>)}</ul>
        </section>}
      </article>
      {data.publishedAt && <PublicProjectProgress id={id} signedIn={signedIn} />}
      {data.history.length > 0 && <section className={institutionCard}>
        <h2 className="font-semibold">{t.history}</h2>
        <ul className="mt-2 grid gap-2">{data.history.map((event) => <li key={event.createdAt} className="border-t border-[var(--theme-border)] pt-2 text-sm">
          {t.actions[event.action]} · {new Date(event.createdAt).toLocaleString(locale)}
          {event.reason && <p className="whitespace-pre-line break-words" dir="auto">{event.reason}</p>}
        </li>)}</ul>
      </section>}
      {(data.canEdit || data.submissionIdentity) && <ProjectOwnerControls key={data.id} data={data} refresh={resource.refresh} />}
      {data.canDecide && data.version !== null && <ReviewActionForm id={id} version={data.version} actions={["request_changes", "approve", "reject", "release"]} refresh={resource.refresh} />}
      {data.canReport && <ReportProjectForm id={id} />}
    </>}
  </div></ProjectShell>;
}

function ProjectCover({ id, signedIn }: { id: string; signedIn: boolean }) {
  const [locale] = useLocale();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "";
    loadProjectImage(id, signedIn, controller.signal).then((blob) => {
      if (!controller.signal.aborted) { owned = URL.createObjectURL(blob); setUrl(owned); setError(null); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause); });
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned); };
  }, [id, signedIn, attempt]);
  if (error !== null) return <ApiErrorNotice error={error} retry={() => setAttempt((value) => value + 1)} />;
  return url ? <Image src={url} alt={projectMessages[locale].cover} width={960} height={600} unoptimized className="max-h-[34rem] w-full rounded-md object-contain" /> : null;
}

function ProjectOwnerControls({ data, refresh }: { data: ProjectDetail; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const [dirty, setDirty] = useState(false);
  const mutation = useFeedMutation();
  return <div className="grid gap-4">
    {data.canEdit && <details>
      <summary className={`${institutionLink} mb-3 cursor-pointer`}>{t.edit}</summary>
      <ProjectForm detail={data} refresh={refresh} onDirty={setDirty} />
    </details>}
    <section className={`${institutionCard} grid gap-3`}>
      {data.submissionIdentity && <ProjectIdentityNotice state={data.submissionIdentity} />}
      {data.canEdit && <form className="grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = new FormData(form).get("image");
        if (file instanceof File && file.size && data.version !== null) void mutation.run(async () => {
          await uploadProjectImage(data.id, data.version!, file);
          form.reset();
          refresh();
        });
      }}>
        <label className="min-w-0 text-sm font-semibold">{t.cover}
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className={institutionField} />
        </label>
        <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy || dirty}>{t.upload}</button>
      </form>}
      {data.canSubmit && <div>
        <p className="mb-2 text-sm">{t.submitHelp}</p>
        <button type="button" disabled={mutation.busy || dirty} className={institutionAction} onClick={() => {
          if (data.version !== null) void mutation.run(async () => { await submitProject(data.id, data.version!); refresh(); });
        }}>{t.submit}</button>
      </div>}
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    </section>
  </div>;
}

function ReportProjectForm({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState(false);
  return <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold">{t.report}</summary>
    {saved ? <p role="status">{t.reported}</p> : <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const category = projectReportCategories.find((value) => value === fields.get("category"));
      if (category) void mutation.run(async () => {
        await reportProject(id, category, String(fields.get("explanation") ?? "").trim());
        setSaved(true);
      });
    }}>
      <label className="text-sm font-semibold">{t.reportCategory}
        <select className={institutionField} name="category">
          {projectReportCategories.map((value) => <option key={value} value={value}>{t.reports[value]}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">{t.reason}<textarea name="explanation" className={institutionField} rows={3} minLength={10} maxLength={500} required /></label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.report}</button>
    </form>}
  </details>;
}
