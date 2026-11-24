"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { pollScopes, type PollConfiguration, type PollDetail, type PollKind, type PollScope } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { editPoll, loadPollOptions, savePoll } from "@/lib/poll-api";
import { pollMessages } from "@/lib/poll-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PollsHeader } from "./polls-header";
import { ProjectIdentityNotice } from "./project-form";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const kinds: Record<PollScope, PollKind[]> = {
  individual: ["community"], community: ["community", "person"], organization: ["community"], project: ["priority", "decision", "person"],
};

function localInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function NewPoll() {
  return <MemberShell><section className="grid min-w-0 gap-4">
    <PollsHeader area="new" />
    <div className={institutionCard}><PollForm /></div>
  </section></MemberShell>;
}

export function PollForm({ detail, refresh }: { detail?: PollDetail; refresh?: () => void }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const router = useRouter();
  const resource = useInstitutionResource(loadPollOptions);
  const mutation = useFeedMutation();
  const requestKey = useRef<string | null>(null);
  const draftVersion = useRef(detail?.version);
  const [scope, setScope] = useState<PollScope>(detail?.scope ?? "individual");
  const [scopeId, setScopeId] = useState(detail?.scopeId ?? "");
  const [kind, setKind] = useState<PollKind>(detail?.kind ?? "community");
  const [policy, setPolicy] = useState<PollDetail["policy"]>(detail?.policy ?? "advisory");
  const high = scope === "organization" || kind !== "community" || policy === "governance";
  const community = resource.data?.communities.find((item) => item.id === scopeId);
  const project = resource.data?.projects.find((item) => item.id === scopeId);
  const scopeOptions = scope === "community" ? resource.data?.communities : scope === "organization" ? resource.data?.organizations : resource.data?.projects;
  const availableScopes = pollScopes.filter((item) => item === "individual" || (item === "community" && !!resource.data?.communities.length) ||
    (item === "organization" && !!resource.data?.organizations.length) || (item === "project" && !!resource.data?.projects.length));
  const memberAudience = scope === "individual" || (scope === "community" && kind !== "person" && !!community?.memberAudience);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body: PollConfiguration = {
      title: text(fields, "title"), description: text(fields, "description"),
      language: text(fields, "language") as PollConfiguration["language"],
      audience: scope === "individual" || (memberAudience && text(fields, "audience") === "members") ? "members" : "scope",
      eligibility: high || text(fields, "eligibility") === "verified" ? "verified" : "active",
      resultPolicy: high || text(fields, "resultPolicy") !== "after_vote" ? "after_close" : "after_vote",
      opensAt: new Date(text(fields, "opensAt")).toISOString(), closesAt: new Date(text(fields, "closesAt")).toISOString(),
      quorum: text(fields, "quorum") ? Number(text(fields, "quorum")) : null,
      threshold: text(fields, "threshold") ? Number(text(fields, "threshold")) : null,
    };
    const options = text(fields, "options").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    void mutation.run(async () => {
      if (detail && draftVersion.current != null) {
        const saved = await editPoll(detail.id, { ...body, version: draftVersion.current, ...(options.length ? { options } : {}) });
        draftVersion.current = saved.version;
        refresh?.();
      } else {
        requestKey.current ??= crypto.randomUUID();
        const created = await savePoll({ ...body, key: requestKey.current, scope, kind, policy,
          scopeId: scope === "individual" ? null : scopeId, taskId: text(fields, "taskId") || null, options });
        router.push("/polls/" + created.id);
      }
    });
  }

  return <form className="grid gap-4" onSubmit={submit}>
    {detail && <p className="text-sm text-[var(--theme-body)]">{t.rules}</p>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!detail && resource.data && resource.data.identity !== "verified" && <div>
      <p className="text-sm">{t.verifiedHelp}</p>
      <ProjectIdentityNotice state={resource.data.identity} />
    </div>}
    {!detail && <div className="grid gap-3 sm:grid-cols-2">
      <label className="min-w-0">{t.scope}<select className={institutionField} value={scope} onChange={(event) => {
        const next = pollScopes.find((key) => key === event.target.value) ?? "individual";
        setScope(next); setScopeId(""); setKind(kinds[next][0]); setPolicy("advisory");
      }}>
        {availableScopes.map((key) => <option key={key} value={key}>{t.scopes[key]}</option>)}
      </select></label>
      {scope !== "individual" && <label className="min-w-0">{t.owner}<select className={institutionField} value={scopeId}
        onChange={(event) => setScopeId(event.target.value)} required>
        <option value="">{t.choose}</option>
        {scopeOptions?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <label className="min-w-0">{t.type}<select className={institutionField} value={kind} onChange={(event) => {
        setKind(kinds[scope].find((key) => key === event.target.value) ?? kinds[scope][0]);
      }}>
        {kinds[scope].filter((key) => key !== "person" || resource.data?.identity === "verified").map((key) =>
          <option key={key} value={key}>{t.kinds[key]}</option>)}
      </select></label>
      {scope !== "individual" && resource.data?.identity === "verified" && <label className="min-w-0">{t.policy}
        <select className={institutionField} value={policy} onChange={(event) => setPolicy(event.target.value === "governance" ? "governance" : "advisory")}>
          <option value="advisory">{t.policies.advisory}</option><option value="governance">{t.policies.governance}</option>
        </select></label>}
      {kind === "decision" && <label className="min-w-0">{t.task}<select className={institutionField} name="taskId" key={scopeId}>
        <option value="">{t.proposal}</option>{project?.tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
      </select></label>}
    </div>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 gap-4">
        <label>{t.question}<input className={institutionField} name="title" defaultValue={detail?.title} minLength={3} maxLength={120} required /></label>
        <label>{t.description}<textarea className={institutionField} name="description" defaultValue={detail?.description} minLength={3} maxLength={2000} rows={3} required /></label>
      </div>
      <div className="grid min-w-0 gap-4">
        <label>{t.language}<select className={institutionField} name="language" defaultValue={detail?.language ?? locale}>
          <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option><option value="es">Español</option>
        </select></label>
        <label>{kind === "person" ? t.nomineeHandles : t.options}
          <textarea className={institutionField} name="options" rows={4} maxLength={1210} required={!detail}
            defaultValue={detail && kind !== "person" ? detail.options.map((item) => item.label).join("\n") : ""} />
          {kind === "person" && <span className="text-sm">{detail ? t.reconsent : t.consentHelp}</span>}
        </label>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="min-w-0">{t.opensAt}<input className={institutionField} name="opensAt" type="datetime-local" required defaultValue={localInput(detail?.opensAt)} /></label>
      <label className="min-w-0">{t.closesAt}<input className={institutionField} name="closesAt" type="datetime-local" required defaultValue={localInput(detail?.closesAt)} /></label>
      {scope !== "individual" && memberAudience && <label className="min-w-0">{t.audience}<select className={institutionField} key={scopeId + kind}
        name="audience" defaultValue={detail?.audience ?? "scope"}>
        <option value="scope">{t.audiences.scope}</option><option value="members">{t.audiences.members}</option>
      </select></label>}
      {!high && <>
        <label className="min-w-0">{t.eligibility}<select className={institutionField} name="eligibility" defaultValue={detail?.eligibility ?? "active"}>
          <option value="active">{t.eligible.active}</option><option value="verified">{t.eligible.verified}</option>
        </select></label>
        <label className="min-w-0">{t.results}<select className={institutionField} name="resultPolicy" defaultValue={detail?.resultPolicy ?? "after_close"}>
          <option value="after_close">{t.resultPolicies.after_close}</option><option value="after_vote">{t.resultPolicies.after_vote}</option>
        </select></label>
      </>}
      {policy === "governance" && <>
        <label className="min-w-0">{t.quorum}<input className={institutionField} type="number" step={1} min={1} max={5000} name="quorum" defaultValue={detail?.quorum ?? ""} /></label>
        <label className="min-w-0">{t.threshold}<input className={institutionField} type="number" step={1} min={50} max={100} name="threshold" defaultValue={detail?.threshold ?? ""} /></label>
      </>}
    </div>
    {high && <p className="text-sm">{t.frozenHelp}</p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    {apiErrorCode(mutation.error) === "MFA_REQUIRED" &&
      <Link className={institutionLink} href={detail ? "/mfa?next=/polls/" + detail.id : "/mfa?next=/polls/new"}>{t.verify}</Link>}
    <button type="submit" className={institutionAction + " justify-self-start"} disabled={mutation.busy}>
      {mutation.busy ? authMessages[locale].working : t.save}
    </button>
  </form>;
}
