import { TopicSelect } from "./group-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionCard, institutionField, institutionAction, institutionLink } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { PageHeader } from "@/components/page-header";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { type GroupDraft, updateGroup, createGroup } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { type MemberGroup, type GroupSettings, type GroupKind, groupKinds, groupPolicies, interestCodes } from "@ayinou/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, type FormEvent } from "react";

const initial: GroupDraft = {
  slug: "", kind: "diaspora", name: "", description: "", rules: "", policy: "approval",
  discussionPublic: false, countryCode: null, topic: null,
};

export function GroupForm({ group, onSaved }: { group?: MemberGroup; onSaved(saved: MemberGroup): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [draft, setDraft] = useState<GroupDraft>(() => group ? {
    slug: group.slug, kind: group.kind, name: group.name, description: group.description, rules: group.rules,
    policy: group.policy, discussionPublic: group.discussionPublic, countryCode: group.countryCode, topic: group.topic,
  } : initial);
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  const submissions = useRef(new Map<string, string>());
  function change(patch: Partial<GroupDraft>) {
    setSaved(false);
    setDraft((value) => ({ ...value, ...patch }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.run(async () => {
      const { slug, kind, ...settings } = draft;
      const data: GroupSettings = { ...settings, countryCode: kind === "diaspora" ? settings.countryCode : null,
        topic: kind === "interest" ? settings.topic : null, discussionPublic: settings.policy === "public" && settings.discussionPublic };
      const fields: GroupDraft = { ...data, slug, kind };
      const fingerprint = JSON.stringify(fields);
      let key = submissions.current.get(fingerprint);
      if (!key) { key = crypto.randomUUID(); submissions.current.set(fingerprint, key); }
      const result = group ? await updateGroup(slug, group.version, data) : await createGroup(fields, key);
      onSaved(result.community);
      setSaved(true);
    });
  }
  return <form className={`${institutionCard} grid gap-4`} onSubmit={submit}>
    <fieldset disabled={mutation.busy} className="grid min-w-0 gap-4">
      <legend className="pb-3 text-xl font-semibold">{group ? t.settings : t.newGroup}</legend>
      <label className="text-sm font-semibold">{t.name}
        <input className={institutionField} required minLength={3} maxLength={80} value={draft.name} onChange={(event) => change({ name: event.target.value })} />
      </label>
      {!group && <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.slug}
          <input className={institutionField} required minLength={3} maxLength={40} pattern="[a-z][a-z0-9]*(?:\x2d[a-z0-9]+)*"
            value={draft.slug} onChange={(event) => change({ slug: event.target.value.toLowerCase() })} />
        </label>
        <label className="min-w-0 text-sm font-semibold">{t.category}
          <select className={institutionField} value={draft.kind} onChange={(event) => change({ kind: event.target.value as GroupKind })}>
            {groupKinds.map((kind) => <option key={kind} value={kind}>{t[kind]}</option>)}
          </select>
        </label>
      </div>}
      <label className="text-sm font-semibold">{t.description}
        <textarea className={institutionField} rows={3} required minLength={10} maxLength={500} value={draft.description} onChange={(event) => change({ description: event.target.value })} />
      </label>
      <label className="text-sm font-semibold">{t.rules}
        <textarea className={institutionField} rows={4} required minLength={10} maxLength={2000} value={draft.rules} onChange={(event) => change({ rules: event.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.membershipPolicy}
          <select className={institutionField} value={draft.policy} onChange={(event) => change({ policy: event.target.value as GroupDraft["policy"], discussionPublic: false })}>
            {groupPolicies.map((policy) => <option key={policy} value={policy}>{t[policy]}</option>)}
          </select>
        </label>
        {draft.kind === "diaspora" ? <label className="text-sm font-semibold">{t.country}
          <input className={institutionField} maxLength={2} pattern="[A-Z]{2}" placeholder="HT" value={draft.countryCode ?? ""}
            onChange={(event) => change({ countryCode: event.target.value.toUpperCase() || null })} />
        </label> : <TopicSelect value={draft.topic ?? ""} change={(value) => change({ topic: interestCodes.find((code) => code === value) ?? null })} />}
      </div>
      {draft.policy === "public" && <label className="flex items-start gap-2 text-sm">
        <input className="mt-1 size-4 shrink-0 accent-[var(--theme-link)]" type="checkbox" checked={draft.discussionPublic}
          onChange={(event) => change({ discussionPublic: event.target.checked })} />
        <span>{t.publicDiscussion}<span className="mt-1 block text-[var(--theme-body)]">{t.publicNote}</span></span>
      </label>}
      <button className={`${institutionAction} justify-self-start`}>{group ? t.save : t.create}</button>
    </fieldset>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {saved && <p role="status">{t.saved}</p>}
  </form>;
}

export function NewGroup() {
  const router = useRouter();
  const [locale] = useLocale();
  return <MemberShell><div className="grid min-w-0 gap-4">
    <PageHeader title={groupMessages[locale].newGroup}
      actions={<Link className={institutionLink} href="/communities">{communityDirectoryMessages[locale].title}</Link>} />
    <GroupForm onSaved={(group) => router.push(`/communities/${group.slug}`)} />
  </div></MemberShell>;
}
