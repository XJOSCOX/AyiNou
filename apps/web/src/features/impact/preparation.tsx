"use client";

import Link from "next/link";
import { useState } from "react";
import { impactDepartments, impactStaffingRoles, type ImpactPreparation, type ImpactStaffingRole } from "@ayinou/shared";
import { institutionCard, institutionField, institutionLink } from "@/components/institution-ui";
import { impactCopy } from "@/lib/impact-i18n";
import { impactPreparationCopy } from "@/lib/impact-preparation-copy";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { ReviewCommand, useReviewCopy } from "../projects/outcome-review/review-controls";
import { impactReceipt } from "./member-controls";

export function FounderPreparationLink({ focus = "staffing" }: { focus?: "evidence" | "publication" | "governance" | "staffing" }) {
  const { founder } = useMemberIdentity();
  const [locale] = useLocale();
  if (!founder) return null;
  return <Link href={`/admin?section=impactSettings#${focus}`} className={institutionLink + " mt-2 inline-flex"}>
    {impactPreparationCopy(locale).open}
  </Link>;
}

export function ReviewerPreparation({ data, departmentLabel, send, after }: {
  data: ImpactPreparation;
  departmentLabel: (scope: string) => string;
  send: (body: string) => Promise<unknown>;
  after: () => void;
}) {
  const [locale] = useLocale();
  const copy = impactPreparationCopy(locale);
  const t = impactCopy(locale);
  const { t: review } = useReviewCopy();
  const [role, setRole] = useState<ImpactStaffingRole>("initial");
  const [department, setDepartment] = useState<string>(impactDepartments[0]);
  const scope = role === "governance" ? "national" : department;
  const selected = data.plans.find((plan) => plan.scope === scope && plan.role === role);
  const roleLabel = (key: ImpactStaffingRole) => key === "publication" ? copy.publication : copy[key];
  return <section id="staffing" className={institutionCard + " grid gap-5 scroll-mt-24"}>
    <h3 className="text-lg font-semibold">{copy.staffing}</h3>
    <div className="grid gap-3 xl:grid-cols-3">
      <section id="evidence" className="rounded-md border border-[var(--theme-border)] p-4 scroll-mt-24">
        <h4 className="font-semibold">{copy.evidence}</h4><p className="mt-2 text-sm">{copy.reviewRules}</p>
      </section>
      <section id="publication" className="rounded-md border border-[var(--theme-border)] p-4 scroll-mt-24">
        <h4 className="font-semibold">{copy.publication}</h4><p className="mt-2 text-sm">{copy.publicationRules}</p>
      </section>
      <section id="governance" className="rounded-md border border-[var(--theme-border)] p-4 scroll-mt-24">
        <h4 className="font-semibold">{copy.governance}</h4><p className="mt-2 text-sm">{copy.governanceRules}</p>
      </section>
    </div>
    <div className="grid gap-3">
      <h4 className="font-semibold">{copy.arrangements}</h4>
      <p className="text-sm">{copy.slotsHelp}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>{review.purpose}<select value={role} className={institutionField} onChange={(event) => setRole(event.target.value as ImpactStaffingRole)}>
          {impactStaffingRoles.map((item) => <option value={item} key={item}>{roleLabel(item)}</option>)}
        </select></label>
        <label>{t("department")}<select value={scope} className={institutionField} onChange={(event) => setDepartment(event.target.value)} disabled={role === "governance"}>
          {role === "governance" ? <option value="national">{t("national")}</option> : impactDepartments.map((item) =>
            <option value={item} key={item}>{departmentLabel(item)}</option>)}
        </select></label>
      </div>
      <ReviewCommand {...impactReceipt} send={send} after={after} action="plan_reviewer" label={copy.plan}
        key={scope + role + (selected?.version ?? 0)} version={selected?.version ?? 0}
        input={(form) => ({ scope, role, slots: Number(form.get("slots")) })}>
        <label>{copy.slots}<input className={institutionField} name="slots" required type="number" min={0} max={10}
          defaultValue={selected?.slots ?? 0} /></label>
      </ReviewCommand>
      {data.plans.length === 0 ? <p className="text-sm">{copy.nonePlanned}</p> :
        <ul className="grid gap-1 text-sm">{data.plans.map((plan) => <li key={plan.scope + plan.role}>
          {departmentLabel(plan.scope)} · {roleLabel(plan.role)} · {plan.slots}
        </li>)}</ul>}
    </div>
    <section>
      <h4 className="font-semibold">{copy.appointments}</h4>
      {data.appointments.length === 0 ? <p className="mt-2 text-sm">{copy.noAppointments}</p> :
        <ul className="mt-2 grid gap-2">{data.appointments.map((item) => <li className="break-words rounded-md border border-[var(--theme-border)] p-3"
          key={item.id + item.scope + item.role}>
          <p className="font-medium">{item.label ?? copy.name} · {copy[item.status]}</p>
          <p className="text-sm">{departmentLabel(item.scope)} · {roleLabel(item.role)} · {review.expiry} <time dateTime={item.expiresAt}>
            {new Date(item.expiresAt).toLocaleString(locale)}
          </time></p>
        </li>)}</ul>}
      {data.appointments.length >= 100 && <p className="mt-2 text-sm">{copy.returned}</p>}
    </section>
    <section>
      <h4 className="font-semibold">{copy.history}</h4>
      {data.rosterHistory.length === 0 ? <p className="mt-2 text-sm">{copy.noHistory}</p> :
        <ol className="mt-2 grid gap-2">{data.rosterHistory.map((event) => <li key={event.id} className="break-words text-sm">
          <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time> · {copy[event.track]} · {departmentLabel(event.scope)}
          <p>{event.reason}</p>
        </li>)}</ol>}
    </section>
  </section>;
}
