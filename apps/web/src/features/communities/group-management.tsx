import { GroupMore } from "./group-controls";
import { GroupForm } from "./group-form";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionCard, institutionField, institutionAction } from "@/components/institution-ui";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { useFeedMutation, useCursorPage } from "@/lib/feed-state";
import { type ManagementAction, type GroupSection, groupManagement, type ManagementEntry, manageGroup } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { type MemberGroup, communityStaffRoles } from "@ayinou/shared";
import Link from "next/link";
import { useState, useRef, useCallback, type FormEvent } from "react";

const sectionChoices = ["requests", "invitations", "staff"] as const;

type PanelAction = ManagementAction["action"];

export function GroupManagement({ group, onSaved }: { group: MemberGroup; onSaved(group: MemberGroup): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [section, setSection] = useState<GroupSection>("requests");
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<PanelAction>("invite");
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("");
  const [invitationId, setInvitation] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  const form = useRef<HTMLFormElement>(null);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await groupManagement(group.slug, section, cursor, signal);
    return { rows: page.entries.map((entry) => ({ ...entry, id: entry.id ?? entry.handle })), nextCursor: page.nextCursor };
  }, [group.slug, section]);
  const resource = useCursorPage(load, revision);
  const owner = group.role === "owner";
  const actions: PanelAction[] = owner
    ? ["invite", "approve", "reject", "remove", "staff", "transfer", "revoke"]
    : ["invite", "approve", "reject", "remove", "revoke"];

  function prepare(action: PanelAction, entry: ManagementEntry) {
    setSelection(action);
    setHandle(entry.handle);
    setInvitation(entry.id ?? "");
    form.current?.querySelector("textarea")?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const details: ManagementAction = selection === "revoke" ? { action: selection, invitationId }
      : selection === "staff" ? { action: selection, handle, role: communityStaffRoles.find((item) => item === role) ?? null }
      : { action: selection, handle };
    void mutation.run(async () => {
      await manageGroup(group.slug, details, reason);
      setReason("");
      setSaved(true);
      setRevision((value) => value + 1);
    });
  }
  return <div className="grid gap-4" aria-label={t.manage}>
    <Link className={institutionLink} href={`/mfa?next=${encodeURIComponent(`/communities/${group.slug}`)}`}>{t.manageMfa}</Link>
    {owner && <GroupForm group={group} onSaved={onSaved} />}
    <section className={`${institutionCard} grid gap-3`}>
      <div className="flex flex-wrap gap-2">
        {sectionChoices.map((value) => <button type="button" key={value} aria-pressed={section === value}
          className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm aria-pressed:bg-[var(--theme-selected)]"
          onClick={() => setSection(value)}>{t[value]}</button>)}
      </div>
      {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
      {resource.error === null && resource.page?.rows.length === 0 && <p>{t.noEntries}</p>}
      {resource.error === null && <ul className="grid gap-2">
        {resource.page?.rows.map((entry) => <li className="flex flex-wrap items-center gap-3 break-all" key={entry.id}>
          <span>{entry.name ? `${entry.name} · ` : ""}@{entry.handle}</span>
          {entry.role && <span>{t[entry.role]}</span>}
          {entry.purpose && <span>{t[entry.purpose]}</span>}
          {section === "requests" && <>{(["approve", "reject"] as const).map((action) =>
            <button key={action} className={institutionLink} onClick={() => prepare(action, entry)}>{t[action]}</button>)}</>}
          {section === "invitations" && (entry.purpose !== "ownership" || owner) &&
            <button className={institutionLink} onClick={() => prepare("revoke", entry)}>{t.revoke}</button>}
        </li>)}
      </ul>}
      <GroupMore resource={resource} />
    </section>
    <form ref={form} className={`${institutionCard} grid gap-3`} onSubmit={submit}>
      <fieldset disabled={mutation.busy} className="grid min-w-0 gap-3">
        <legend className="text-lg font-semibold">{t.manage}</legend>
        <select className={institutionField} aria-label={t.manage} value={selection} onChange={(event) => setSelection(event.target.value as PanelAction)}>
          {actions.map((action) => <option key={action} value={action}>{t[action]}</option>)}
        </select>
        {selection === "revoke" ? <label className="text-sm font-semibold">{t.invitations}
          <input className={institutionField} value={invitationId} onChange={(event) => setInvitation(event.target.value)} required maxLength={36} />
        </label> : <label className="text-sm font-semibold">{t.handle}
          <input className={institutionField} value={handle} onChange={(event) => setHandle(event.target.value.toLowerCase())} required maxLength={24} />
        </label>}
        {selection === "staff" && <label className="text-sm font-semibold">{t.staff}
          <select className={institutionField} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">{communityDirectoryMessages[locale].revoke}</option>
            {communityStaffRoles.map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select>
        </label>}
        {selection === "remove" && <p className="text-sm">{t.removedNotice}</p>}
        <label className="text-sm font-semibold">{t.reason}
          <textarea className={institutionField} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={500} />
        </label>
        <button className={`${institutionAction} justify-self-start`}>{t[selection]}</button>
      </fieldset>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      {saved && <p role="status">{t.saved}</p>}
    </form>
  </div>;
}
