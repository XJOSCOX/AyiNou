"use client";

import Link from "next/link";
import { NeedLinkPicker } from "./need-project-links";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { interestCodes, projectOwners, type ProjectDetail, type ProjectIdentityState, type ProjectOwnerKind, type ProjectProposal } from "@ayinou/shared";
import { fetchDepartments } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { createProject, loadProjectOptions, saveProject } from "@/lib/project-api";
import { projectMessages } from "@/lib/project-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { ProjectSection, ProjectsHeader, projectPanel } from "./project-ui";

const sections = ["description","problem","solution","objectives","beneficiaries","outcomes"] as const;
const get = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export function ProjectIdentityNotice({ state, forProposal = false }: { state: ProjectIdentityState; forProposal?: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <div className="grid gap-1 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-body)]">
    <p>{forProposal && state === "required" ? t.proposalIdentityRequired : t.identity[state]}</p>
    {state !== "verified" && <Link className={`${institutionLink} justify-self-start`} href="/verification">
      {state === "required" ? t.requestIdentity : t.openVerification}
    </Link>}
  </div>;
}

export function NewProjectScreen() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.newProject} description={t.newHelp} current="manage" backHref="/projects/manage" />
    <ProjectForm />
  </div></MemberShell>;
}

export function ProjectForm({ detail, onSaved, onDirty, awaitingRefresh = false }: {
  detail?: ProjectDetail; onSaved?: (version: number) => void; onDirty?: (dirty: boolean) => void; awaitingRefresh?: boolean;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const topics = membershipMessages[locale];
  const router = useRouter();
  const initial = detail?.proposal;
  const [selectedNeed,setSelectedNeed]=useState("");
  const [kind, setKind] = useState<ProjectOwnerKind>("individual");
  const [country, setCountry] = useState(initial?.country ?? "HT");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const creationKey = useRef<string | null>(null);
  const options = useInstitutionResource(detail ? emptyOptions : loadProjectOptions);
  const departments = useInstitutionResource(fetchDepartments);
  const mutation = useFeedMutation();
  const owners = kind === "community" ? options.data?.communities.filter((room) => room.canOwn) : options.data?.organizations;
  const submissionIdentity = kind === "individual"
    ? options.data?.individualSubmissionIdentity ?? options.data?.submissionIdentity
    : options.data?.submissionIdentity;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (awaitingRefresh) return;
    const fields = new FormData(event.currentTarget);
    const category = interestCodes.find((code) => code === get(fields, "category"));
    if (!category) return;
    const proposal: ProjectProposal = {
      title: get(fields, "title"), description: get(fields, "description"), problem: get(fields, "problem"), solution: get(fields, "solution"),
      objectives: get(fields, "objectives"), beneficiaries: get(fields, "beneficiaries"), outcomes: get(fields, "outcomes"),
      category, country: country.trim().toUpperCase(), department: get(fields, "department") || null,
      startDate: get(fields, "startDate") || null, endDate: get(fields, "endDate") || null,
      references: get(fields, "references").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      publishRequested: initial?.publishRequested ?? false,
    };
    void mutation.run(async () => {
      if (detail && detail.version !== null) {
        const saved = await saveProject(detail.id, detail.version, proposal, fields.has("removeImage"));
        onDirty?.(false);
        onSaved?.(saved.version);
      } else {
        creationKey.current ??= crypto.randomUUID();
        const result = await createProject({ kind, owner: kind === "individual" ? null : get(fields, "owner"),
          association: get(fields, "association") || null, proposal }, creationKey.current);
        router.push("/projects/"+result.id+(selectedNeed ? "?needLink="+encodeURIComponent(selectedNeed) : ""));
      }
    });
  }

  return <form className="grid min-w-0 gap-4" onSubmit={save} onChange={() => onDirty?.(true)} aria-busy={mutation.busy || awaitingRefresh}>
    {(detail?.status === "approved" || detail?.revisionPending) && <p className={projectPanel + " p-4 text-sm text-[var(--theme-body)]"}>
      {t.editApprovalHelp}
    </p>}
    <ProjectSection title={t.proposalOverview}>
      <label className="min-w-0 text-sm font-semibold">{t.projectName}
        <input className={institutionField} name="title" required minLength={3} maxLength={120} defaultValue={initial?.title} />
      </label>
      <p className="max-w-prose text-sm text-[var(--theme-body)]">{t.safety}</p>
      {departments.error !== null && <ApiErrorNotice error={departments.error} retry={departments.refresh} />}
      {!detail && <>
        {options.error !== null && <ApiErrorNotice error={options.error} retry={options.refresh} signIn />}
        {submissionIdentity && submissionIdentity !== "verified" && <ProjectIdentityNotice state={submissionIdentity} forProposal />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold">{t.owner}
            <select value={kind} className={institutionField} onChange={(event) => {
              setKind(projectOwners.find((type) => type === event.target.value) ?? "individual");
            }}>
              <option value="individual">{t.owners.individual}</option>
              {!!options.data?.organizations.length && <option value="organization">{t.owners.organization}</option>}
              {options.data?.communities.some((room) => room.canOwn) && <option value="community">{t.owners.community}</option>}
            </select>
          </label>
          {kind !== "individual" && <label className="min-w-0 text-sm font-semibold">{t.ownerAccount}
            <select key={kind} name="owner" className={institutionField} required>
              <option value="">{t.choose}</option>
              {owners?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
          <label className="min-w-0 text-sm font-semibold">{t.association}
            <select className={institutionField} name="association">
              <option value="">{t.none}</option>
              {options.data?.communities.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
        </div>
        <NeedLinkPicker selected={selectedNeed} select={setSelectedNeed} draft />
      </>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm font-semibold">{t.category}
          <select name="category" className={institutionField} defaultValue={initial?.category ?? ""} required>
            <option value="">{t.choose}</option>
            {interestCodes.map((key) => <option key={key} value={key}>{topics[key]}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-semibold">{t.country}
          <input className={institutionField} name="country" value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())}
            required maxLength={2} pattern="[A-Z]{2}" aria-describedby="project-country-help" />
          <span className="mt-1 block text-xs font-normal" id="project-country-help">{t.countryHelp}</span>
        </label>
        {country === "HT" && <label className="min-w-0 text-sm font-semibold">{t.department}
          <select name="department" className={institutionField} value={department} onChange={(event) => setDepartment(event.target.value)} disabled={!departments.data}>
            <option value="">{t.none}</option>
            {departments.data?.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}
          </select>
        </label>}
      </div>
    </ProjectSection>
    <ProjectSection title={t.proposalContent}>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((key) => <label key={key} className={`min-w-0 text-sm font-semibold ${key === "description" ? "lg:col-span-2" : ""}`}>{t.fields[key]}
          <textarea dir="auto" name={key} className={institutionField + " resize-y"} rows={key === "description" ? 4 : 3}
            maxLength={key === "description" ? 2400 : 1000} defaultValue={initial?.[key]} />
        </label>)}
      </div>
    </ProjectSection>
    <ProjectSection title={t.proposalSchedule}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.startDate}<input type="date" name="startDate" className={institutionField} defaultValue={initial?.startDate ?? ""} /></label>
        <label className="min-w-0 text-sm font-semibold">{t.endDate}<input type="date" name="endDate" className={institutionField} defaultValue={initial?.endDate ?? ""} /></label>
      </div>
      <label className="text-sm font-semibold">{t.references}
        <textarea name="references" className={institutionField} rows={3} maxLength={905} defaultValue={initial?.references.join("\n")} />
      </label>
      {detail?.hasImage && <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" name="removeImage" />{t.removeImage}
      </label>}
    </ProjectSection>
    <div className={projectPanel + " grid min-w-0 gap-3 p-4"}>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--theme-body)]">{t.completeHelp}</p>
        <button className={institutionAction} disabled={mutation.busy || awaitingRefresh || (!!detail?.proposal.department && country === "HT" && !departments.data)}>
          {mutation.busy || awaitingRefresh ? authMessages[locale].working : t.saveDraft}
        </button>
      </div>
    </div>
  </form>;
}

const emptyOptions: typeof loadProjectOptions = async () => ({
  organizations: [], communities: [], canReview: false, canModerate: false, canAssignOthers: false, submissionIdentity: "required",
});
