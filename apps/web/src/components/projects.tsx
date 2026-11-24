"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { interestCodes, projectReportCategories, type ProjectCard, type ProjectDetail } from "@ayinou/shared";
import { fetchDepartments, fetchMyProfile } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { membershipMessages } from "@/lib/membership-i18n";
import { loadMyProjects, loadProject, loadProjectImage, loadProjectOptions, loadProjects, reportProject, setProjectPublication, submitProject, uploadProjectImage } from "@/lib/project-api";
import { projectMessages } from "@/lib/project-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { FilterPanel } from "./filter-panel";
import { ApiErrorNotice } from "./api-error-notice";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { FounderMark, PersonalClaimChecks, institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { ProjectDisclosure, ProjectLoading, ProjectPublicationBadge, ProjectSection, ProjectStatusBadge, ProjectsHeader, projectBadge, projectLink, projectPanel } from "./project-ui";
import { ProjectForm, ProjectIdentityNotice } from "./project-form";
import { PublicProjectProgress } from "./project-progress";
import { ProjectDecisionPanel, ProjectPreviewApproval } from "./project-review";

const fields = ["description", "problem", "solution", "objectives", "beneficiaries", "outcomes"] as const;
const minimumSubmissionLength = 10;
const directoryRow = "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-5 sm:px-5";


function ProjectShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return <MemberShell signedIn={signedIn}>{children}</MemberShell>;
}

function MyProjectOwnerBadge() {
  const { claims, founder, founderVerified } = useMemberIdentity();
  return <>
    <PersonalClaimChecks claims={claims.filter((claim) => claim === "identity")} />
    {founder && <FounderMark compact />}
    {founderVerified && <FounderVerifiedMark compact />}
  </>;
}

function ProjectOwnerBadges({ owner }: { owner: ProjectCard["owner"] }) {
  if (owner.kind !== "individual") return null;
  return <>
    <PersonalClaimChecks claims={owner.personalClaims?.filter((claim) => claim === "identity") ?? []} />
    {owner.founderVerified && <FounderVerifiedMark compact />}
  </>;
}

function DirectoryProjectRow({ item, departmentName, signedIn }: {
  item: ProjectCard; departmentName?: string; signedIn: boolean;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const titleId = useId();
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(item.country);
  const location = [departmentName ?? item.department, country ?? item.country].filter(Boolean).join(", ");
  const publicationDate = item.publishedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.publishedAt)) : null;
  const initials = item.title.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase(locale);

  return <li className="min-w-0">
    <Link href={`/projects/${item.id}`} aria-labelledby={titleId}
      className={directoryRow + " group hover:bg-[var(--theme-control)] focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]"}>
      <div aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--theme-selected)] text-sm font-bold text-[var(--theme-link)] sm:size-16 sm:text-base">
        {initials}
        {item.hasImage && <ProjectCover key={item.publishedAt} id={item.id} signedIn={signedIn} thumbnail />}
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="text-xs font-semibold text-[var(--theme-link)]">{membershipMessages[locale][item.category]}</span>
        <h3 id={titleId} dir="auto" className="min-w-0 wrap-anywhere text-base font-bold leading-snug group-hover:underline group-focus-visible:underline sm:text-lg">
          {item.title}
        </h3>
        <p className="flex min-w-0 flex-wrap gap-x-2 text-sm text-[var(--theme-body)]">
          {item.owner?.name && <>
            <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
              <bdi className="wrap-anywhere">{item.owner.name}</bdi><ProjectOwnerBadges owner={item.owner} />
            </span>
            <span aria-hidden="true">·</span>
          </>}
          <span className="wrap-anywhere">{location}</span>
        </p>
      </div>
      <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-3 sm:row-start-1 sm:justify-end">
        <ProjectStatusBadge status="approved">{t.status.approved}</ProjectStatusBadge>
        {item.publishedAt && <time dateTime={item.publishedAt} className="text-xs text-[var(--theme-body)]" title={t.published}>{publicationDate}</time>}
      </div>
      <span aria-hidden="true" className="col-start-3 row-span-2 row-start-1 grid size-8 place-items-center justify-self-end rounded-full border border-[var(--theme-border)] text-[var(--theme-link)] group-hover:bg-[var(--theme-selected)] sm:col-start-4 sm:row-span-1">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </span>
    </Link>
  </li>;
}

function ManagedProjectTile({ item, restricted = false, departmentName, showOwnerDesignation = false }: {
  item: ProjectCard; restricted?: boolean; departmentName?: string; showOwnerDesignation?: boolean;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(item.country);
  const location = [departmentName, country].filter(Boolean).join(" · ");
  const titleId = useId();

  return <li className="min-w-0">
    <Link href={`/projects/${item.id}`} aria-labelledby={titleId}
      className="group grid h-full min-w-0 content-start gap-2 rounded-lg border border-[var(--theme-border)] px-4 py-3 transition-colors hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] motion-reduce:transition-none">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 id={titleId} dir="auto" className="min-w-0 flex-[1_1_10rem] break-words text-lg font-semibold leading-snug group-hover:underline group-focus-visible:underline">
          {item.title}
        </h3>
        {item.publishedAt && item.status === "approved" ? <ProjectPublicationBadge />
          : <ProjectStatusBadge status={restricted ? undefined : item.status}>
            {restricted ? t.restricted : t.status[item.status]}
          </ProjectStatusBadge>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {item.publishedAt && item.status !== "approved" && <ProjectPublicationBadge previousVersion />}
        {!item.publishedAt && !restricted && item.status === "approved" && <span className={projectBadge}>{t.privateApproval}</span>}
        <span className={projectBadge}>{membershipMessages[locale][item.category]}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-[var(--theme-body)]">
          {item.owner?.name && <span dir="auto" className="min-w-0 break-words">{item.owner.name}</span>}
          {item.owner?.name && (showOwnerDesignation
            ? <MyProjectOwnerBadge />
            : <ProjectOwnerBadges owner={item.owner} />)}
          {item.owner?.name && location && <span aria-hidden="true">·</span>}
          {location && <span dir="auto" className="min-w-0 break-words">{location}</span>}
        </div>
      </div>
    </Link>
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
  const category = interestCodes.find((value) => value === filter.category);
  const departmentName = (code: string | null) => departments.data?.find((entry) => entry.code === code)?.name;
  const country = filter.country ? new Intl.DisplayNames([locale], { type: "region" }).of(filter.country) : undefined;
  const activeFilters = [category && membershipMessages[locale][category], country, departmentName(filter.department) ?? filter.department].filter(Boolean);
  return <ProjectShell signedIn={signedIn}><section className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.title} description={t.discoveryHelp} current="directory" showNavigation={signedIn} backHref={signedIn ? "/dashboard" : "/"}
      actions={signedIn && <Link href="/projects/new" className={institutionAction + " gap-2"}>
        <span className="text-lg leading-none" aria-hidden="true">+</span>{t.newProject}
      </Link>} />
    <section aria-labelledby="project-directory-heading" className={projectPanel}>
      <FilterPanel className="border-b border-[var(--theme-border)] px-3 py-2 sm:px-5 sm:py-3"
        leading={<h2 id="project-directory-heading" className="text-base font-bold sm:text-lg">{t.directoryHeading}</h2>}
        active={activeFilters.length} summary={activeFilters.join(" · ")}>
        <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]" onReset={() => setFilter({})} onSubmit={(event) => {
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
          <div className="flex min-w-0 flex-wrap gap-2">
            <button type="submit" className={institutionAction}>{t.filter}</button>
            {activeFilters.length > 0 && <button type="reset" className={projectLink}>{t.clearFilters}</button>}
          </div>
        </form>
        {departments.error !== null && <div className="mt-3"><ApiErrorNotice error={departments.error} retry={departments.refresh} /></div>}
      </FilterPanel>
      {error !== null && <div className="p-4 sm:px-5"><ApiErrorNotice error={error} retry={retry} signIn={signedIn} /></div>}
      {!page && error === null && <div role="status">
        <span className="sr-only">{authMessages[locale].working}</span>
        <div aria-hidden="true" className={directoryRow + " min-h-24 motion-safe:animate-pulse"}>
          <div className="size-11 rounded-lg bg-[var(--theme-selected)] sm:size-16" />
          <div className="grid gap-2">
            <div className="h-4 w-2/5 max-w-56 rounded bg-[var(--theme-control)]" />
            <div className="h-3 w-1/3 max-w-36 rounded bg-[var(--theme-control)]" />
          </div>
        </div>
      </div>}
      {page?.rows.length === 0 && <p role="status" className="px-3 py-8 text-center text-sm text-[var(--theme-body)] sm:px-5">
        {activeFilters.length ? t.emptyFiltered : t.emptyDirectory}
      </p>}
      {!!page?.rows.length && <ul className="divide-y divide-[var(--theme-border)] [&>li:last-child>a]:rounded-b-xl">
        {page.rows.map((row) => <DirectoryProjectRow key={row.id} item={row} signedIn={signedIn} departmentName={departmentName(row.department)} />)}
      </ul>}
      {page?.nextCursor && <div className="border-t border-[var(--theme-border)] px-3 py-3 sm:px-5">
        <button className={projectLink} type="button" disabled={loadingMore} onClick={() => { void more(); }}>{t.more}</button>
      </div>}
    </section>
  </section></ProjectShell>;
}

export function ManageProjectsScreen() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const resource = useInstitutionResource(loadMyProjects);
  const options = useInstitutionResource(loadProjectOptions);
  const mine = resource.data?.projects.filter((item) => item.createdByMe);
  const manage = resource.data?.projects.filter((item) => !item.createdByMe);
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.manage} description={t.manageHelp} current="manage" canReview={options.data?.canReview ?? false}
      actions={<Link href="/projects/new" className={institutionAction + " gap-2"}>
        <span aria-hidden="true">+</span>{t.newProject}
      </Link>} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {options.error !== null && <ApiErrorNotice error={options.error} retry={options.refresh} signIn />}
    {!resource.data && resource.error === null && <ProjectLoading />}
    {resource.data && <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
      {[{ title: t.mine, rows: mine ?? [] }, { title: t.managed, rows: manage ?? [] }].map(({ title, rows }) =>
        <ProjectSection key={title} title={title} count={rows.length}>
          {rows.length ? <ul className="grid gap-2">
            {rows.map((item) => <ManagedProjectTile key={item.id} item={item} restricted={item.restricted}
              showOwnerDesignation={item.createdByMe && item.owner?.kind === "individual"} />)}
          </ul> : <p className="text-sm text-[var(--theme-body)]">{t.emptyManage}</p>}
        </ProjectSection>)}
    </div>}
  </div></MemberShell>;
}

const proposalColumns = "grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]";
const factLabel = "text-sm text-[var(--theme-body)]";
const factValue = "mt-0.5 break-words text-sm font-medium";

export function ProjectDetailScreen({ id, signedIn, reviewPreview = false }: { id: string; signedIn: boolean; reviewPreview?: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const loader = useCallback((signal: AbortSignal) => loadProject(id, signedIn, signal, reviewPreview), [id, signedIn, reviewPreview]);
  const resource = useInstitutionResource(loader);
  const departments = useInstitutionResource(fetchDepartments);
  const data = resource.data?.id === id ? resource.data : null;

  return <ProjectShell signedIn={signedIn}><div className="grid min-w-0 gap-4">
    {!data && <ProjectsHeader title={projectWorkMessages[locale].proposal} description={t.proposalHelp} showNavigation={signedIn}
      current={reviewPreview ? "review" : undefined} backHref={reviewPreview ? "/projects/review" : "/projects"} />}
    {resource.error !== null && <div className={institutionCard}>
      {reviewPreview && apiErrorCode(resource.error) === "MFA_REQUIRED"
        ? <Link href="/projects/review?verify=1" className={institutionAction}>{t.verify}</Link>
        : <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn={signedIn} />}
    </div>}
    {!data && resource.error === null && <div role="status" className="grid gap-4">
      <span className="sr-only">{authMessages[locale].working}</span>
      <div aria-hidden="true" className={proposalColumns}>
        <div className={institutionCard + " grid gap-4 motion-safe:animate-pulse"}>
          <div className="h-5 w-1/3 rounded bg-[var(--theme-selected)]" />
          <div className="h-3 w-5/6 rounded bg-[var(--theme-selected)]" />
          <div className="h-3 w-3/4 rounded bg-[var(--theme-selected)]" />
        </div>
        <div className={institutionCard + " grid gap-4 motion-safe:animate-pulse"}>
          <div className="h-5 w-1/2 rounded bg-[var(--theme-selected)]" />
          <div className="h-3 w-2/3 rounded bg-[var(--theme-selected)]" />
        </div>
      </div>
    </div>}
    {data && <ProjectDetailContent key={data.id} data={data} signedIn={signedIn} reviewPreview={reviewPreview}
      departmentName={departments.data?.find((item) => item.code === data.department)?.name} refresh={resource.refresh} />}
  </div></ProjectShell>;
}

function ProjectDetailContent({ data, signedIn, reviewPreview, departmentName, refresh }: {
  data: ProjectDetail; signedIn: boolean; reviewPreview: boolean; departmentName?: string; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const [editor, setEditor] = useState<"unopened" | "open" | "closed">("unopened");
  const [dirty, setDirty] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const saved = savedVersion !== null && data.version !== null && data.version >= savedVersion;
  const editing = editor === "open" && !saved;
  const awaitingRefresh = savedVersion !== null && !saved;

  useEffect(() => {
    if (saved) feedback.current?.focus();
  }, [saved]);
  const category = membershipMessages[locale][data.category];
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(data.country);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const sections = fields.filter((field) => data.proposal[field]);
  const hasOverview = data.hasImage || sections.length > 0 || data.proposal.references.length > 0 || Boolean(data.publishedAt);
  const publicationNotices = {
    private: t.privatePublicationHelp,
    pending_institution_verification: t.institutionVerificationPending,
    unavailable: t.publicationUnavailable,
    published: null,
  };
  const publicationNotice = data.publicationEligibility ? publicationNotices[data.publicationEligibility] : null;
  const changesRequested = !reviewPreview && !data.restricted && data.version !== null && data.status === "changes_requested";
  const changeReason = changesRequested ? data.history.find((event) => event.action === "request_changes")?.reason : null;
  const area = reviewPreview || data.canDecide ? "review" : data.version !== null ? "manage" : "directory";
  const backHref = area === "review" ? "/projects/review" : area === "manage" ? "/projects/manage" : "/projects";

  return <>
    <ProjectsHeader title={projectWorkMessages[locale].proposal} description={t.proposalHelp}
      current={area} showNavigation={signedIn} backHref={backHref} actions={<>
        {data.canDecide && <a href="#project-review-decision" className={institutionAction}>{t.reviewProposal}</a>}
        {signedIn && data.canOpenWork && <Link className={projectLink} href={`/projects/${data.id}/work`}>
          {projectWorkMessages[locale].openWorkspace}
        </Link>}
        {data.canEdit && <button type="button" className={institutionAction} aria-expanded={editing} disabled={awaitingRefresh}
          aria-controls="project-proposal-editor" onClick={() => {
            setSavedVersion(null);
            setEditor(editing ? "closed" : "open");
          }}>{t.edit}</button>}
      </>} />
    <section className={projectPanel}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <h2 dir="auto" className="min-w-0 flex-[1_1_15rem] break-words text-2xl font-bold tracking-tight">{data.title}</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {data.publishedAt && area === "manage" && data.status === "approved" ? <ProjectPublicationBadge />
            : <ProjectStatusBadge status={data.restricted ? undefined : data.status}>
              {data.restricted ? t.restricted : t.status[data.status]}
            </ProjectStatusBadge>}
          <span className={projectBadge}>{category}</span>
          {data.publishedAt && area === "manage" && data.revisionPending && <ProjectPublicationBadge previousVersion />}
          {data.publicationEligibility === "private" && <span className={projectBadge}>{t.privateApproval}</span>}
        </div>
      </div>
      {(data.status === "approved" || publicationNotice || data.revisionPending) && <div className="grid gap-2 border-t border-[var(--theme-border)] px-4 py-3 text-sm text-[var(--theme-body)] sm:px-6">
        {data.status === "approved" && <p className="max-w-[80ch]">{t.approvalHelp}</p>}
        {data.revisionPending ? <p className="max-w-[80ch]">{data.publishedAt ? t.revisionPublicHelp : t.revisionPrivateHelp}</p>
          : data.publicationEligibility === "unavailable" && data.canEdit && data.owner.kind === "individual"
            ? <IndividualPublicationNotice />
            : publicationNotice && <p className="max-w-[80ch]">{publicationNotice}</p>}
      </div>}
    </section>
    {changesRequested && (changeReason || data.canEdit) && <section aria-labelledby="project-review-feedback"
      className={projectPanel + " grid gap-2 px-4 py-4 sm:px-6"}>
      <h2 id="project-review-feedback" className="font-semibold">{t.reviewerFeedback}</h2>
      {changeReason && <p dir="auto" className="max-w-[80ch] whitespace-pre-wrap wrap-anywhere text-sm text-[var(--theme-body)]">
        {changeReason}
      </p>}
      {data.canEdit && <p className="text-sm text-[var(--theme-body)]">{t.reviseAndResubmit}</p>}
    </section>}
    {data.canEdit && <div id="project-proposal-editor" hidden={!editing}>
      {editor !== "unopened" && !saved && <ProjectForm detail={data} onDirty={setDirty} awaitingRefresh={awaitingRefresh}
        onSaved={(version) => {
          setSavedVersion(version);
          refresh();
        }} />}
    </div>}
    {saved && <p ref={feedback} tabIndex={-1} role="status" className={projectPanel + " px-4 py-3 text-sm font-semibold text-[var(--theme-link)]"}>
      {t.saved}
    </p>}
    {!editing && <div className={hasOverview ? proposalColumns : "grid min-w-0 gap-4"}>
      {hasOverview && <div className="grid min-w-0 gap-4">
        {(data.hasImage || sections.length > 0) && <article className={institutionCard + " !rounded-xl"}>
          {data.hasImage && <ProjectCover key={`${data.id}:${data.version ?? "published"}`} id={data.id} signedIn={signedIn} reviewPreview={reviewPreview} />}
          {sections.length > 0 && <div className={data.hasImage ? "mt-5" : ""}>
            {sections.map((field) => <section key={field} className="border-b border-[var(--theme-border)] py-4 first:pt-0 last:border-b-0 last:pb-0">
              <h2 className="text-base font-semibold">{t.fields[field]}</h2>
              <p className="mt-2 max-w-[78ch] whitespace-pre-line break-words text-sm leading-relaxed text-[var(--theme-body)] sm:text-base" dir="auto">
                {data.proposal[field]}
              </p>
            </section>)}
          </div>}
        </article>}
        {data.proposal.references.length > 0 && <section className={institutionCard + " !rounded-xl"}>
          <h2 className="text-base font-semibold">{t.referencesTitle}</h2>
          <ul className="mt-2 divide-y divide-[var(--theme-border)]">
            {data.proposal.references.map((url, index) => <li key={`${url}:${index}`} className="break-all py-2 last:pb-0">
              <a className={institutionLink} href={url} target="_blank" rel="noreferrer">{url}<span aria-hidden="true"> ↗</span></a>
            </li>)}
          </ul>
        </section>}
        {data.publishedAt && <PublicProjectProgress id={data.id} signedIn={signedIn} />}
      </div>}
      <div className="grid min-w-0 gap-4">
        {data.canDecide && data.version !== null && <ProjectDecisionPanel id={data.id} version={data.version} refresh={refresh} />}
        <section className={institutionCard + " !rounded-xl"}>
          <h2 className="text-lg font-semibold">{t.detailsHeading}</h2>
          <dl className="mt-3 grid gap-3">
            <div><dt className={factLabel}>{t.owner}</dt>
              <dd className={factValue + " flex flex-wrap items-center gap-1.5"} dir="auto">
                {data.owner.name && <><bdi>{data.owner.name}</bdi><ProjectOwnerBadges owner={data.owner} /><span aria-hidden="true">·</span></>}
                <span>{t.owners[data.owner.kind]}</span>
              </dd>
            </div>
            {data.association && <div><dt className={factLabel}>{t.association}</dt>
              <dd className={factValue} dir="auto">{data.association.name}</dd>
            </div>}
            <div><dt className={factLabel}>{t.country}</dt><dd className={factValue}>{country}</dd></div>
            {data.department && <div><dt className={factLabel}>{t.department}</dt><dd className={factValue}>{departmentName ?? data.department}</dd></div>}
            {data.proposal.startDate && <div><dt className={factLabel}>{t.startDate}</dt>
              <dd className={factValue}><time dateTime={data.proposal.startDate}>{dates.format(new Date(data.proposal.startDate))}</time></dd>
            </div>}
            {data.proposal.endDate && <div><dt className={factLabel}>{t.endDate}</dt>
              <dd className={factValue}><time dateTime={data.proposal.endDate}>{dates.format(new Date(data.proposal.endDate))}</time></dd>
            </div>}
            {data.publishedAt && <div><dt className={factLabel}>{t.published}</dt>
              <dd className={factValue}><time dateTime={data.publishedAt}>{new Date(data.publishedAt).toLocaleDateString(locale)}</time></dd>
            </div>}
          </dl>
        </section>
        {(data.canEdit || data.submissionIdentity || data.canPublish || data.canUnpublish) &&
          <ProjectOwnerControls data={data} dirty={dirty} refresh={refresh} />}
        {data.history.length > 0 && <section className={institutionCard + " !rounded-xl"}>
          <h2 className="text-lg font-semibold">{t.history}</h2>
          <ul className="mt-3 divide-y divide-[var(--theme-border)]">
            {data.history.map((event, index) => <li key={`${event.createdAt}:${index}`} className="py-2 text-sm first:pt-0 last:pb-0">
              <p className="font-semibold">{t.actions[event.action]}</p>
              <time dateTime={event.createdAt} className="text-[var(--theme-body)]">{new Date(event.createdAt).toLocaleString(locale)}</time>
              {event.reason && <p className="mt-1 whitespace-pre-line break-words" dir="auto">{event.reason}</p>}
            </li>)}
          </ul>
        </section>}
        {data.canReport && <ReportProjectForm id={data.id} />}
      </div>
    </div>}
    {reviewPreview && data.approval && <ProjectPreviewApproval key={data.approval.version}
      id={data.id} approval={data.approval} refresh={refresh} />}
  </>;
}

function ProjectCover({ id, signedIn, thumbnail = false, reviewPreview = false }: {
  id: string; signedIn: boolean; thumbnail?: boolean; reviewPreview?: boolean;
}) {
  const [locale] = useLocale();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "";
    loadProjectImage(id, signedIn, controller.signal, reviewPreview).then((blob) => {
      if (!controller.signal.aborted) { owned = URL.createObjectURL(blob); setUrl(owned); setError(null); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause); });
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned); };
  }, [id, signedIn, attempt, reviewPreview]);
  if (thumbnail) return url && error === null
    ? <Image src={url} alt="" width={64} height={64} unoptimized className="absolute inset-0 size-full object-cover" />
    : null;
  if (error !== null) return <ApiErrorNotice error={error} retry={() => setAttempt((value) => value + 1)} />;
  return url ? <Image src={url} alt={projectMessages[locale].cover} width={960} height={600} unoptimized className="max-h-[34rem] w-full rounded-md object-contain" /> : null;
}

function IndividualPublicationNotice() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const { data: profile } = useInstitutionResource(fetchMyProfile);

  if (profile?.isVisible !== false) {
    return <p className="max-w-[80ch]">{t.publicationUnavailable}</p>;
  }
  return <div className="grid justify-items-start gap-2">
    <p className="max-w-[80ch]">{t.publicationProfileHidden}</p>
    <Link href="/profile" className={projectLink}>{t.openProfile}</Link>
  </div>;
}

function ProjectOwnerControls({ data, dirty, refresh }: { data: ProjectDetail; dirty: boolean; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const incomplete = fields.filter((field) => Array.from(data.proposal[field].trim()).length < minimumSubmissionLength);
  return <section className={institutionCard + " grid min-w-0 gap-3 !rounded-xl"}>
    <h2 className="text-lg font-semibold">{t.manageProposalHeading}</h2>
    {data.submissionIdentity && data.submissionIdentity !== "verified" &&
      <ProjectIdentityNotice state={data.submissionIdentity} forProposal />}
    {data.canEdit && <ProjectDisclosure title={t.cover}>
      {data.status === "approved" && <p className="text-sm text-[var(--theme-body)]">{t.editApprovalHelp}</p>}
      <form className="grid min-w-0 gap-3" onSubmit={(event) => {
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
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className={institutionField + " min-w-0 text-sm"} />
        </label>
        <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy || dirty}>{t.upload}</button>
      </form>
    </ProjectDisclosure>}
    {data.canSubmit && <div className="grid gap-3">
      {incomplete.length ? <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] p-3 text-sm">
        <p>{t.submissionRequirements}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          {incomplete.map((field) => <li key={field}>{t.fields[field]}</li>)}
        </ul>
      </div> : <p className="text-sm">{t.submitHelp}</p>}
      <button type="button" disabled={mutation.busy || dirty || incomplete.length > 0}
        className={institutionAction + " justify-self-start"} onClick={() => {
          if (data.version !== null) void mutation.run(async () => { await submitProject(data.id, data.version!); refresh(); });
        }}>{data.revisionPending ? t.resubmit : t.submit}</button>
    </div>}
    {(data.canPublish || data.canUnpublish) && <ProjectDisclosure title={data.canUnpublish ? t.makePrivate : t.publishNow}>
      <p className="text-sm text-[var(--theme-body)]">{data.canUnpublish ? t.makePrivateHelp : t.publishNowHelp}</p>
      <button type="button" className={institutionAction + " justify-self-start"} disabled={mutation.busy || dirty} onClick={() => {
        if (data.version !== null) void mutation.run(async () => {
          await setProjectPublication(data.id, data.version!, !data.canUnpublish);
          refresh();
        });
      }}>{data.canUnpublish ? t.makePrivate : t.publishNow}</button>
    </ProjectDisclosure>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
  </section>;
}

function ReportProjectForm({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState(false);
  return <ProjectDisclosure title={t.report}>
    {saved ? <p role="status" className="text-sm">{t.reported}</p> : <form className="grid min-w-0 gap-3" onSubmit={(event) => {
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
  </ProjectDisclosure>;
}
