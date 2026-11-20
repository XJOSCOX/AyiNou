"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { pollDecisions, type PollDetail, type PollNomination } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { castBallot, loadNominations, loadOwnBallot, loadPoll, loadPolls, respondToNomination, transitionPoll, type PollContext } from "@/lib/poll-api";
import { pollMessages } from "@/lib/poll-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PollForm } from "./poll-form";

const secondary = "min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold disabled:opacity-60";

export function PollDirectory({ mine = false, context = null }: { mine?: boolean; context?: PollContext | null }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const scope = context?.scope;
  const scopeId = context?.scopeId;
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { items, nextCursor } = await loadPolls(mine, scope && scopeId ? { scope, scopeId } : null, cursor, signal);
    return { rows: items, nextCursor };
  }, [mine, scope, scopeId]);
  const { page, error, more, retry, loadingMore } = useCursorPage(loader);
  return <MemberShell><section className="grid gap-4">
    <h1 className="text-3xl font-semibold">{mine ? t.mine : t.title}</h1>
    <p>{t.rules}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/polls/new" className={institutionAction}>{t.create}</Link>
      {mine || context ? <Link href="/polls" className={institutionLink}>{t.title}</Link> :
        <Link href="/polls/mine" className={institutionLink}>{t.mine}</Link>}
      <Link href="/polls/nominations" className={institutionLink}>{t.nominations}</Link>
    </div>
    {error !== null && <ApiErrorNotice error={error} retry={retry} signIn />}
    {!page && error === null && <p role="status">{t.loading}</p>}
    {page?.rows.length === 0 && <p>{t.empty}</p>}
    <ul className="grid gap-3 lg:grid-cols-2">
      {page?.rows.map((poll) => <li key={poll.id} className={institutionCard + " grid gap-2"}>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span>{t.kinds[poll.kind]}</span><span>{t.states[poll.status]}</span>
        </div>
        <Link lang={poll.language} className={institutionLink + " break-words text-lg"} href={"/polls/" + poll.id}>{poll.title}</Link>
        {poll.scopeName && <p className="break-words text-sm">{poll.scopeName}</p>}
      </li>)}
    </ul>
    {page?.nextCursor && <button type="button" className={secondary + " justify-self-start"} disabled={loadingMore}
      onClick={() => void more()}>{loadingMore ? t.loading : t.more}</button>}
  </section></MemberShell>;
}

export function PollDetailScreen({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const loader = useCallback((signal: AbortSignal) => loadPoll(id, signal), [id]);
  const resource = useInstitutionResource(loader);
  return <MemberShell><section className="grid gap-4">
    <Link href="/polls" className={institutionLink}>{t.title}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data ? <PollDetailBody key={id} poll={resource.data} refresh={resource.refresh} /> :
      resource.error === null && <p role="status">{t.loading}</p>}
  </section></MemberShell>;
}

function PollDetailBody({ poll, refresh }: { poll: PollDetail; refresh: () => void }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const count = new Intl.NumberFormat(locale);
  const mutation = useFeedMutation();
  const [selected, setSelected] = useState("");
  const label = (id: string) => poll.options.find((option) => option.id === id)?.label ?? t.unavailableOption;
  const version = poll.version;
  const high = poll.policy === "governance" || poll.kind !== "community" || poll.scope === "organization";
  function vote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    void mutation.run(async () => {
      try {
        await castBallot(poll.id, selected);
      } catch (cause) {
        const receipt = await loadOwnBallot(poll.id).catch(() => null);
        if (receipt?.optionId !== selected) throw cause;
      }
      refresh();
    });
  }
  function act(action: string, fields: Record<string, string> = {}) {
    if (version === null) return;
    void mutation.run(async () => {
      await transitionPoll(poll.id, { action, version, ...fields });
      refresh();
    });
  }
  const canCancel = (poll.status === "draft" && poll.canManage) ||
    (["scheduled", "open", "awaiting_close"].includes(poll.status) && (poll.canManage || poll.canModerate));
  return <>
    <article className={institutionCard + " grid gap-4"}>
      <p className="text-sm">{t.kinds[poll.kind]} · {t.states[poll.status]}{poll.scopeName && " · " + poll.scopeName}</p>
      <h1 lang={poll.language} className="break-words text-3xl font-semibold">{poll.title}</h1>
      <p lang={poll.language} className="whitespace-pre-wrap break-words">{poll.description}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries({
          [t.opensAt]: date.format(new Date(poll.opensAt)), [t.closesAt]: date.format(new Date(poll.closesAt)),
          [t.audience]: t.audiences[poll.audience], [t.eligibility]: t.eligible[poll.eligibility],
          [t.results]: t.resultPolicies[poll.resultPolicy], [t.policy]: t.policies[poll.policy],
          ...(poll.electorateSize !== null ? { [t.electorate]: count.format(poll.electorateSize) } : {}),
          ...(poll.quorum !== null ? { [t.quorum]: count.format(poll.quorum) } : {}),
          ...(poll.threshold !== null ? { [t.threshold]: percent.format(poll.threshold / 100) } : {}),
        }).map(([title, value]) => <div key={title}><dt className="text-sm font-semibold">{title}</dt><dd>{value}</dd></div>)}
      </dl>
      {poll.cancellationReason && <p className="break-words">{t.cancel}: {poll.cancellationReason}</p>}
      {poll.status !== "draft" && poll.status !== "cancelled" && <form className="grid gap-3" onSubmit={vote}>
        <fieldset className="grid gap-2" disabled={!poll.canVote || mutation.busy}>
          <legend className="mb-2 font-semibold">{t.optionsTitle}</legend>
          {poll.options.map((option) => <label key={option.id} className={secondary + " flex items-center gap-2 break-words"}>
            <input type="radio" name="choice" value={option.id} checked={(poll.ownBallot ?? selected) === option.id}
              onChange={() => setSelected(option.id)} disabled={!option.available} />
            <span className="min-w-0" lang={poll.language}>{label(option.id)}{option.handle && " (@" + option.handle + ")"}</span>
          </label>)}
        </fieldset>
        {poll.ownBallot && <p role="status">{t.receipt}: {label(poll.ownBallot)}</p>}
        {poll.canVote && <><p className="text-sm">{t.finalBallot}</p>
          <button className={institutionAction + " justify-self-start"} disabled={!selected || mutation.busy}>{t.vote}</button></>}
        {!poll.canVote && !poll.ownBallot && poll.status === "open" && <p>{t.cannotVote}</p>}
      </form>}
    </article>
    {poll.results && <section className={institutionCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{poll.results.outcome ? t.results : t.previewResults}</h2>
      <p>{t.total}: {count.format(poll.results.total)}</p>
      {poll.results.outcome && <p>{t.outcomes[poll.results.outcome]}{poll.results.winnerId && ": " + label(poll.results.winnerId)}</p>}
      <ul className="grid gap-2">
        {poll.results.options.map((option) => <li key={option.id} className="grid gap-1">
          <span className="break-words">{label(option.id)} · {count.format(option.votes)} · {percent.format(option.percentage / 100)}</span>
          <meter className="w-full" aria-label={label(option.id)} min={0} max={100} value={option.percentage} />
        </li>)}
      </ul>
    </section>}
    {poll.decision && <section className={institutionCard + " grid gap-2"}>
      <h2 className="text-xl font-semibold">{t.recordDecision}</h2>
      <p>{t.dispositions[poll.decision.disposition]}{poll.decision.recommendedOptionId && ": " + label(poll.decision.recommendedOptionId)}</p>
      <p className="whitespace-pre-wrap break-words">{poll.decision.reason}</p>
    </section>}
    {poll.canManage && poll.status === "draft" && <section className={institutionCard + " grid gap-4"}>
      <h2 className="text-xl font-semibold">{t.edit}</h2>
      {poll.kind === "person" && <ul className="grid gap-1">{poll.options.map(({ id, label, consent }) =>
        <li key={id}>{label ?? t.unavailableOption}{consent && " · " + t.consents[consent]}</li>)}</ul>}
      <PollForm key={version} detail={poll} refresh={refresh} />
      <p>{high ? t.frozenHelp : t.publishHelp}</p>
      <button type="button" className={institutionAction + " justify-self-start"} disabled={mutation.busy}
        onClick={() => act("publish")}>{t.publish}</button>
    </section>}
    {poll.canManage && poll.status === "awaiting_close" && <button type="button" className={institutionAction + " justify-self-start"}
      disabled={mutation.busy} onClick={() => act("close")}>{t.finalize}</button>}
    {canCancel && <details className={institutionCard}><summary className="cursor-pointer font-semibold">{t.cancel}</summary>
      <form className="mt-3 grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        act(poll.canManage ? "cancel" : "moderate_cancel", { reason: String(new FormData(event.currentTarget).get("reason")) });
      }}>
        <label>{t.reason}<textarea className={institutionField} name="reason" required minLength={3} maxLength={600} /></label>
        <button className={secondary + " justify-self-start"} disabled={mutation.busy}>{t.cancel}</button>
      </form>
    </details>}
    {poll.canManage && poll.policy === "governance" && poll.status === "closed" && !poll.decision &&
      <form className={institutionCard + " grid gap-3"} onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        act("record_decision", { reason: String(data.get("reason")), disposition: String(data.get("disposition")) });
      }}>
        <h2 className="text-xl font-semibold">{t.recordDecision}</h2>
        <label>{t.disposition}<select name="disposition" className={institutionField}>
          {pollDecisions.filter((item) => item !== "recommend" || poll.results?.winnerId).map((item) =>
            <option key={item} value={item}>{t.dispositions[item]}</option>)}
        </select></label>
        <label>{t.reason}<textarea className={institutionField} name="reason" required minLength={3} maxLength={600} /></label>
        <button className={institutionAction + " justify-self-start"} disabled={mutation.busy}>{t.recordDecision}</button>
      </form>}
    {mutation.busy && <p role="status">{t.loading}</p>}
    {mutation.error !== null && <div><ApiErrorNotice error={mutation.error} retry={refresh} signIn />
      {apiErrorCode(mutation.error) === "MFA_REQUIRED" && <Link className={institutionLink} href={"/mfa?next=/polls/" + poll.id}>{t.verify}</Link>}
    </div>}
    {poll.events.length > 0 && <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.history}</h2>
      <ul className="mt-3 grid gap-2">{poll.events.map((event) => <li key={event.id} className="break-words">
        {t.events[event.action]} · {date.format(new Date(event.at))}{event.reason && " · " + event.reason}
      </li>)}</ul>
    </section>}
  </>;
}

export function PollNominations() {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const resource = useInstitutionResource(loadNominations);
  return <MemberShell><section className="grid gap-4">
    <Link href="/polls" className={institutionLink}>{t.title}</Link>
    <h1 className="text-3xl font-semibold">{t.nominations}</h1>
    <p>{t.consentHelp}</p>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data?.nominations.map((item) => <Nomination key={item.id} item={item} refresh={resource.refresh} />)}
    {resource.data?.nominations.length === 0 && <p>{t.noNominations}</p>}
    {!resource.data && resource.error === null && <p role="status">{t.loading}</p>}
  </section></MemberShell>;
}

function Nomination({ item, refresh }: { item: PollNomination; refresh: () => void }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const mutation = useFeedMutation();
  function respond(response: "accepted" | "declined" | "withdrawn") {
    void mutation.run(async () => {
      await respondToNomination(item.pollId, item.id, response);
      refresh();
    });
  }
  return <article className={institutionCard + " grid gap-3"}>
    <h2 lang={item.title ? item.language : locale} className="break-words text-lg font-semibold">{item.title ?? t.unavailableNomination}</h2>
    {item.description && <p lang={item.language} className="whitespace-pre-wrap break-words">{item.description}</p>}
    <p>{t.consents[item.consent]}</p>
    <div className="flex flex-wrap gap-2">
      {item.consent === "pending" && item.canRespond && <button className={institutionAction} disabled={mutation.busy}
        onClick={() => respond("accepted")}>{t.accept}</button>}
      {(item.consent === "accepted" || item.canRespond) && <button className={secondary} disabled={mutation.busy}
        onClick={() => respond(item.consent === "accepted" ? "withdrawn" : "declined")}>{item.consent === "accepted" ? t.withdraw : t.decline}</button>}
    </div>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
  </article>;
}
