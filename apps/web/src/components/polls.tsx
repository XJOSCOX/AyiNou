"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { pollDecisions, type PollCard, type PollDetail, type PollNomination, type PollStatus } from "@ayinou/shared";
import { ApiRequestError, apiErrorCode } from "@/lib/api-errors";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { castBallot, loadNominations, loadOwnBallot, loadPoll, loadPolls, respondToNomination, transitionPoll, type PollContext } from "@/lib/poll-api";
import { pollMessages } from "@/lib/poll-i18n";
import { socialMessages } from "@/lib/social-i18n";
import { watchPoll } from "@/lib/poll-refresh";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, PersonalClaimChecks, useInstitutionResource, VerifiedCheck } from "./institution-ui";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { MemberShell } from "./member-shell";
import { PollsHeader } from "./polls-header";
import { PollForm } from "./poll-form";

const secondary = "min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold disabled:opacity-60";

const pollPanel = "min-w-0 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]";

function PollStatusMark({ status, label }: { status: PollStatus; label: string }) {
  const appearance = status === "cancelled" ? "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]"
    : status === "open" || status === "scheduled" ? "bg-[var(--theme-selected)] text-[var(--theme-link)]"
      : "bg-[var(--theme-control)] text-[var(--theme-body)]";
  return <span className={"inline-flex w-fit shrink-0 rounded-md px-2 py-1 text-xs font-semibold " + appearance}>{label}</span>;
}

type SampledPoll = PollDetail & { serverNow?: number; sampledAt: number };

function PollScopeName({ poll }: { poll: PollCard }) {
  const [locale] = useLocale();
  const { scopeBadges } = poll;
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
    <bdi className="wrap-anywhere">{poll.scopeName ?? pollMessages[locale].scopes[poll.scope]}</bdi>
    {poll.scopeName && <>
      {!!scopeBadges?.personalClaims?.length && <PersonalClaimChecks claims={scopeBadges.personalClaims} />}
      {scopeBadges?.founderVerified && <FounderVerifiedMark compact />}
      {scopeBadges?.verifiedOrganization && <VerifiedCheck label={socialMessages[locale].verifiedOrganization} />}
    </>}
  </span>;
}

function PollCountdown({ boundary, label, serverNow, sampledAt }: {
  boundary: string; label: string; serverNow?: number; sampledAt: number;
}) {
  const [locale] = useLocale();
  const [seconds, setSeconds] = useState<number | null>(null);
  const ends = Date.parse(boundary);

  useEffect(() => {
    if (!Number.isFinite(ends)) return;
    function update() {
      const now = serverNow === undefined ? Date.now() : serverNow + (performance.now() - sampledAt);
      const remaining = Math.max(0, Math.ceil((ends - now) / 1000));
      setSeconds(remaining);
      if (!remaining) window.clearInterval(interval);
    }
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [ends, serverNow, sampledAt]);

  if (seconds === null) return null;
  const days = Math.floor(seconds / 86400);
  const digits = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
  const parts = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const dayCount = days ? new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "short" }).format(days) : "";
  return <span role="timer" aria-live="off"
    className="inline-flex flex-wrap items-center gap-x-1.5 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-2.5 py-1 text-sm text-[var(--theme-body)]">
    {label}
    <span className="font-semibold tabular-nums text-[var(--theme-text)]" dir="ltr">
      {dayCount && `${dayCount} `}{parts.map((part) => digits.format(part)).join(":")}
    </span>
  </span>;
}

function PollLoading({ label }: { label: string }) {
  return <div role="status" className="grid gap-3 px-4 py-5 motion-safe:animate-pulse sm:px-6">
    <span className="sr-only">{label}</span>
    <span aria-hidden="true" className="h-4 w-2/5 max-w-60 rounded bg-[var(--theme-selected)]" />
    <span aria-hidden="true" className="h-3 w-3/5 max-w-80 rounded bg-[var(--theme-control)]" />
  </div>;
}

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
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <MemberShell><section className="grid min-w-0 gap-4">
    <PollsHeader area={mine ? "mine" : "browse"} />
    <div className={pollPanel}>
      {error !== null && <div className="p-4"><ApiErrorNotice error={error} retry={retry} signIn /></div>}
      {!page && error === null && <PollLoading label={t.loading} />}
      {page?.rows.length === 0 && <p role="status" className="px-4 py-8 text-center text-sm text-[var(--theme-body)]">{t.empty}</p>}
      {!!page?.rows.length && <ul className="divide-y divide-[var(--theme-border)]">
        {page.rows.map((poll) => <li key={poll.id}>
          <Link href={"/polls/" + poll.id} aria-label={poll.title}
            className="group flex min-w-0 items-center gap-3 px-4 py-4 hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 sm:gap-4 sm:px-5">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--theme-control)] text-[var(--theme-link)] sm:size-10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 4v16h16M8 16v-4m5 4V7m5 9v-6" />
              </svg>
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <h2 lang={poll.language} dir="auto" className="wrap-anywhere text-base font-bold leading-snug group-hover:underline sm:text-lg">{poll.title}</h2>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[var(--theme-body)]">
                <PollStatusMark status={poll.status} label={t.states[poll.status]} />
                <span>{t.kinds[poll.kind]} · <PollScopeName poll={poll} /></span>
                {poll.status !== "cancelled" && <span className="text-xs">{t.closesAt} · <time dateTime={poll.closesAt}>
                  {date.format(new Date(poll.closesAt))}
                </time></span>}
              </div>
            </div>
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--theme-border)] text-[var(--theme-link)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </Link>
        </li>)}
      </ul>}
      {page?.nextCursor && <div className="border-t border-[var(--theme-border)] p-4">
        <button type="button" className={secondary} disabled={loadingMore} onClick={() => void more()}>{loadingMore ? t.loading : t.more}</button>
      </div>}
    </div>
  </section></MemberShell>;
}

export function PollDetailScreen({ id }: { id: string }) {
  return <PollDetailResource key={id} id={id} />;
}

function PollDetailResource({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const [data, setData] = useState<SampledPoll | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useRef<(replace: boolean) => void>(null);
  const refresh = useCallback(() => reload.current?.(true), []);

  useEffect(() => {
    const watcher = watchPoll({
      load: (signal) => loadPoll(id, signal),
      publish(next, sampledAt) { setData({ ...next, sampledAt }); setError(null); },
      fail(cause) {
        if (!(cause instanceof ApiRequestError && cause.retryable)) setData(null);
        setError(cause);
      },
      visible: () => document.visibilityState === "visible",
      monotonic: () => performance.now(),
      wallTime: () => Date.now(),
      schedule(callback, delay) {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
    });
    reload.current = watcher.refresh;
    window.addEventListener("focus", watcher.visibilityChanged);
    document.addEventListener("visibilitychange", watcher.visibilityChanged);
    watcher.refresh();
    return () => {
      reload.current = null;
      watcher.dispose();
      window.removeEventListener("focus", watcher.visibilityChanged);
      document.removeEventListener("visibilitychange", watcher.visibilityChanged);
    };
  }, [id]);

  return <MemberShell><section className="grid min-w-0 gap-4">
    <PollsHeader area="detail" />
    {error !== null && <ApiErrorNotice error={error} retry={refresh} signIn />}
    {data ? <PollDetailBody poll={data} refresh={refresh} /> : error === null && <div className={pollPanel}><PollLoading label={t.loading} /></div>}
  </section></MemberShell>;
}

function PollDetailBody({ poll, refresh }: { poll: SampledPoll; refresh: () => void }) {
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
    if (!selected || !poll.canVote || !poll.options.some((option) => option.id === selected && option.available)) return;
    void mutation.run(async () => {
      try {
        await castBallot(poll.id, selected);
      } catch (cause) {
        if (["POLL_CLOSED", "POLL_NOT_OPEN", "POLL_CANCELLED", "POLL_NOT_ELIGIBLE", "POLL_CHANGED"].includes(apiErrorCode(cause))) {
          refresh();
          throw cause;
        }
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
  const results = poll.results;
  const leadingVotes = Math.max(0, ...(results?.options.map((option) => option.votes) ?? []));
  const hasBallot = poll.status !== "draft" && poll.status !== "cancelled";
  const canCancel = (poll.status === "draft" && poll.canManage) ||
    (["scheduled", "open", "awaiting_close"].includes(poll.status) && (poll.canManage || poll.canModerate));
  return <>
    <article className={institutionCard + " grid gap-5 !rounded-xl"}>
      <header className="grid gap-2">
        <h1 lang={poll.language} dir="auto" className="max-w-4xl wrap-anywhere text-2xl font-bold leading-tight sm:text-4xl">{poll.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--theme-body)]">
          <span>{t.kinds[poll.kind]} · <PollScopeName poll={poll} /></span>
          <PollStatusMark status={poll.status} label={t.states[poll.status]} />
          {(poll.status === "scheduled" || poll.status === "open") && <PollCountdown key={poll.status}
            boundary={poll.status === "scheduled" ? poll.opensAt : poll.closesAt}
            label={poll.status === "scheduled" ? t.opensIn : t.closesIn} serverNow={poll.serverNow} sampledAt={poll.sampledAt} />}
        </p>
      </header>
      <p lang={poll.language} dir="auto" className="max-w-[72ch] whitespace-pre-wrap wrap-anywhere leading-relaxed text-[var(--theme-body)]">{poll.description}</p>
      {poll.cancellationReason && <p className="break-words">{t.cancel}: {poll.cancellationReason}</p>}
      <div className={"grid min-w-0 items-start gap-5 border-t border-[var(--theme-border)] pt-5 " +
        (hasBallot ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-6" : "")}>
        {hasBallot && <form className="grid min-w-0 gap-3" onSubmit={vote}>
          <fieldset className="grid gap-2" disabled={!poll.canVote || mutation.busy}>
            <legend className="mb-2 font-semibold">{t.optionsTitle}</legend>
            {poll.options.map((option) => {
              const tally = results?.options.find(({ id }) => id === option.id);
              const leads = leadingVotes > 0 && tally?.votes === leadingVotes;
              const meterColor = leads
                ? "[&::-webkit-meter-optimum-value]:bg-[var(--theme-primary)] [&::-moz-meter-bar]:bg-[var(--theme-primary)]"
                : "[&::-webkit-meter-optimum-value]:bg-[var(--theme-link)]/50 [&::-moz-meter-bar]:bg-[var(--theme-link)]/50";
              return <div key={option.id}
                className="min-w-0 rounded-md border border-[var(--theme-border)] has-[:checked]:border-[var(--theme-link)] has-[:checked]:bg-[var(--theme-selected)]">
                <label className="flex min-h-10 items-center gap-3 px-3 py-2 text-sm font-semibold wrap-anywhere">
                  <input type="radio" name="choice" value={option.id} checked={(poll.ownBallot ?? selected) === option.id}
                    onChange={() => setSelected(option.id)} disabled={!option.available} />
                  <span className="min-w-0" lang={poll.language}>{label(option.id)}{option.handle && " (@" + option.handle + ")"}</span>
                </label>
                {tally && <div className="grid gap-1.5 px-3 pb-3">
                  <meter aria-label={label(option.id)} min={0} max={100} value={tally.percentage}
                    className={"block h-2 w-full appearance-none overflow-hidden rounded-full bg-[var(--theme-border)] [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-[var(--theme-border)] " + meterColor} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--theme-body)]">
                    {leads && <span className="font-semibold text-[var(--theme-link)]">{t.outcomes.winner}</span>}
                    <span className="ms-auto tabular-nums">{count.format(tally.votes)} · {percent.format(tally.percentage / 100)}</span>
                  </div>
                </div>}
              </div>;
            })}
          </fieldset>
          {poll.ownBallot && <p role="status">{t.receipt}: {label(poll.ownBallot)}</p>}
          {poll.canVote && <><p className="text-sm">{t.finalBallot}</p>
            <button className={institutionAction + " justify-self-start"} disabled={!selected || mutation.busy}>{t.vote}</button></>}
          {!poll.canVote && !poll.ownBallot && poll.status === "open" && <p>{t.cannotVote}</p>}
        </form>}
        <dl className={"grid min-w-0 gap-x-5 gap-y-4 rounded-lg bg-[var(--theme-control)] p-4 sm:grid-cols-2 " +
            (hasBallot ? "content-start" : "lg:grid-cols-3")}>
          {Object.entries({
            [t.opensAt]: date.format(new Date(poll.opensAt)), [t.closesAt]: date.format(new Date(poll.closesAt)),
            [t.audience]: t.audiences[poll.audience], [t.eligibility]: t.eligible[poll.eligibility],
            [t.results]: t.resultPolicies[poll.resultPolicy], [t.policy]: t.policies[poll.policy],
            ...(poll.electorateSize !== null ? { [t.electorate]: count.format(poll.electorateSize) } : {}),
            ...(poll.quorum !== null ? { [t.quorum]: count.format(poll.quorum) } : {}),
            ...(poll.threshold !== null ? { [t.threshold]: percent.format(poll.threshold / 100) } : {}),
          }).map(([title, value]) => <div key={title} className="min-w-0">
            <dt className="text-xs font-semibold text-[var(--theme-body)]">{title}</dt>
            <dd className="mt-0.5 wrap-anywhere text-sm font-semibold">{value}</dd>
          </div>)}
        </dl>
      </div>
    </article>
    {results && <section className={institutionCard + " grid gap-2"}>
      <h2 className="text-xl font-semibold">{results.outcome ? t.results : t.previewResults}</h2>
      <p>{t.total} · {count.format(results.total)}</p>
      {results.outcome && <p>{t.outcomes[results.outcome]}{results.winnerId && " · " + label(results.winnerId)}</p>}
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
      <PollForm detail={poll} refresh={refresh} />
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
  return <MemberShell><section className="grid min-w-0 gap-4">
    <PollsHeader area="nominations" />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data?.nominations.map((item) => <Nomination key={item.id} item={item} refresh={resource.refresh} />)}
    {resource.data?.nominations.length === 0 && <p className={institutionCard}>{t.noNominations}</p>}
    {!resource.data && resource.error === null && <div className={pollPanel}><PollLoading label={t.loading} /></div>}
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
