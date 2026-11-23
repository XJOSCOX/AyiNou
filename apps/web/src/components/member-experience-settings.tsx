"use client";

import { memberExperienceFlags, type MemberExperiencePolicy, type SavedMemberExperiencePolicy } from "@ayinou/shared";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";

const route = "/api/v1/admin/member-experience";
const groups = [
  { title: "onboarding", flags: memberExperienceFlags.slice(0, 8) },
  { title: "profiles", flags: memberExperienceFlags.slice(8) },
] as const;

export function MemberExperienceSettings({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale].memberExperience;
  const load = useCallback((signal: AbortSignal): Promise<SavedMemberExperiencePolicy> =>
    authorizedRequest(route, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspaceId } }), [workspaceId]);
  const resource = useInstitutionResource(load);
  const [receipt, setReceipt] = useState<SavedMemberExperiencePolicy>();
  const current = resource.data && receipt && receipt.revision > resource.data.revision ? receipt : resource.data;
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.title}</h2>
    {resource.error ? <div className="mt-3"><AdminFeedback error={resource.error} retry={resource.refresh} /></div>
      : !current ? <p role="status">{authMessages[locale].working}</p>
        : <PolicyForm key={current.revision} current={current} workspaceId={workspaceId}
          reload={resource.refresh} saveReceipt={(saved) => { setReceipt(saved); resource.refresh(); }} />}
  </section>;
}

function PolicyForm({ current, workspaceId, saveReceipt, reload }: {
  current: SavedMemberExperiencePolicy; workspaceId: string; saveReceipt: (saved: SavedMemberExperiencePolicy) => void;
  reload: () => void;
}) {
  const [locale] = useLocale();
  const labels = adminMessages[locale];
  const t = labels.memberExperience;
  const [value, setValue] = useState<MemberExperiencePolicy>(current.value);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const request = useRef({ signature: "", id: "" });
  const canSave = !busy && !stale && reason.trim().length >= 10 && memberExperienceFlags.some((flag) => value[flag] !== current.value[flag]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const change = { value, expectedRevision: current.revision, reason: reason.trim() };
    const signature = JSON.stringify(change);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    try {
      const saved: SavedMemberExperiencePolicy = await authorizedRequest(route, {
        method: "PATCH", headers: { "X-Ayinou-Workspace": workspaceId },
        body: JSON.stringify({ ...change, requestId: request.current.id }),
      });
      saveReceipt(saved);
    } catch (cause) {
      setError(cause);
      if (apiErrorCode(cause) === "STALE_VERSION") { setStale(true); reload(); }
    } finally { setBusy(false); }
  }

  return <form className="mt-4 grid gap-5" onSubmit={submit}>
    <p role="status" className="text-sm">{labels.registrationPolicy.revision} {current.revision}</p>
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(({ title, flags }) => <fieldset className="rounded-md border border-[var(--theme-border)] p-3" key={title} disabled={busy || stale}>
        <legend className="px-2 font-semibold">{t[title]}</legend>
        {flags.map((flag) => <label key={flag} className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={value[flag]} onChange={(event) => setValue({ ...value, [flag]: event.target.checked })} />
          {t.flags[flag]}
        </label>)}
      </fieldset>)}
    </div>
    <label className="max-w-lg">{labels.registrationPolicy.reason}
      <textarea className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
        required minLength={10} maxLength={500} disabled={busy || stale} />
    </label>
    {error !== null && <AdminFeedback error={error} />}
    <button className={`${institutionAction} justify-self-start`} disabled={!canSave}>{t.save}</button>
  </form>;
}
