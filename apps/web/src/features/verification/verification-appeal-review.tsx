import { TrustError, PublicReferences, fields, field } from "./trust-controls";
import { useInstitutionResource, institutionCard, institutionField, institutionAction } from "@/components/institution-ui";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { loadAppealQueue, decideVerificationAppeal } from "@/lib/trust-api";
import { trustMessages } from "@/lib/trust-i18n";
import { type VerificationAppeal, verificationAppealOutcomes } from "@ayinou/shared";

const assignedAppeals = (signal: AbortSignal) => loadAppealQueue("assigned", signal);

export function VerificationAppealReview() {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const resource = useInstitutionResource(assignedAppeals);
  return <section className={`${institutionCard} grid gap-3`}>
    <h2 className="text-xl font-semibold">{t.appeals}</h2>
    <p className="text-sm text-[var(--theme-body)]">{t.appealEvidence}</p>
    {resource.error !== null && <TrustError error={resource.error} retry={resource.refresh} returnTo="/verification/review" />}
    {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {resource.data?.appeals.length === 0 && <p>{t.noAppeals}</p>}
    {resource.data?.appeals.map((item) => <AppealReviewCard key={item.id} item={item} refresh={resource.refresh} />)}
  </section>;
}

function AppealReviewCard({ item, refresh }: { item: VerificationAppeal; refresh(): void }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const mutation = useFeedMutation();
  return <details className="break-words border-t border-[var(--theme-border)] pt-2">
    <summary className="cursor-pointer font-semibold">{new Date(item.createdAt).toLocaleString(locale)}</summary>
    <p className="mt-2 whitespace-pre-wrap">{item.explanation}</p>
    <PublicReferences references={item.references ?? []} />
    <p className="mt-2 text-sm font-semibold">{t.originalDecision}</p>
    <p className="whitespace-pre-wrap">{item.originalRationale}</p>
    <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      const outcome = verificationAppealOutcomes.find((value) => value === field(form, "outcome"));
      if (outcome) void mutation.run(async () => { await decideVerificationAppeal(item.id, outcome, field(form, "rationale")); refresh(); });
    }}>
      <label className="text-sm font-semibold">{t.decide}
        <select name="outcome" className={institutionField}>
          {verificationAppealOutcomes.map((outcome) => <option key={outcome} value={outcome}>{t[outcome]}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">{t.reason}
        <textarea name="rationale" className={institutionField} rows={3} minLength={10} maxLength={1000} required />
      </label>
      {mutation.error !== null && <TrustError error={mutation.error} returnTo="/verification/review" />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.decide}</button>
    </form>
  </details>;
}
