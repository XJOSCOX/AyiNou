import { TrustError, fields, field, links, ExplanationFields } from "./trust-controls";
import { useInstitutionResource, institutionCard, institutionField, institutionAction } from "@/components/institution-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { loadVerificationAppeals, submitVerificationAppeal } from "@/lib/trust-api";
import { trustMessages } from "@/lib/trust-i18n";
import { type VerificationApplication } from "@ayinou/shared";
import { useState } from "react";

export function MyVerificationAppeals({ applications }: { applications: VerificationApplication[] }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const statuses = institutionMessages[locale];
  const resource = useInstitutionResource(loadVerificationAppeals);
  const [selected, setSelected] = useState("");
  const mutation = useFeedMutation();
  const appealIds = new Set(resource.data?.appeals.map(({ applicationId }) => applicationId));
  const eligible = applications.filter((item) => item.canAppeal && item.decidedAt && !appealIds.has(item.id));
  const currentSelection = eligible.some(({ id }) => id === selected) ? selected : "";
  return <section className={`${institutionCard} grid gap-3`}>
    <h2 className="text-xl font-semibold">{t.appeals}</h2>
    <p className="text-sm text-[var(--theme-body)]">{t.appealWindow}</p>
    {resource.error !== null && <TrustError error={resource.error} retry={resource.refresh} />}
    {resource.data && <ul className="grid gap-2">
      {resource.data.appeals.map((appeal) => <li key={appeal.id} className="break-words border-b border-[var(--theme-border)] pb-2">
        <p className="font-semibold">{t[appeal.outcome]}</p>
        <time dateTime={appeal.createdAt} className="text-sm">{new Date(appeal.createdAt).toLocaleDateString(locale)}</time>
        {appeal.rationale && <p className="whitespace-pre-wrap">{appeal.rationale}</p>}
        {appeal.outcome === "reconsideration" && <p className="text-sm">{t.appealEvidence}</p>}
      </li>)}
    </ul>}
    {resource.data && !resource.data.appeals.length && <p className="text-sm">{t.noAppeals}</p>}
    {resource.data && eligible.length > 0 && <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      const element = event.currentTarget;
      if (!currentSelection) return;
      void mutation.run(async () => {
        await submitVerificationAppeal(currentSelection, field(form, "explanation"), links(form));
        element.reset(); setSelected(""); resource.refresh();
      });
    }}>
      <label className="text-sm font-semibold">{t.appeal}
        <select className={institutionField} value={currentSelection} required onChange={(event) => setSelected(event.target.value)}>
          <option value="">—</option>
          {eligible.map((item) => <option key={item.id} value={item.id}>
            {statuses[item.kind]} · {statuses[item.status]} · {new Date(item.decidedAt!).toLocaleDateString(locale)}
          </option>)}
        </select>
      </label>
      <ExplanationFields />
      {mutation.error !== null && <TrustError error={mutation.error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.submitAppeal}</button>
    </form>}
  </section>;
}
