"use client";

import Link from "next/link";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { fetchAccountCodes } from "@/lib/api";
import { canRegister, loadRegistrationPolicy } from "@/lib/registration";
import { authMessages } from "@/lib/auth-i18n";
import { f24Messages } from "@/lib/f24-i18n";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { safetyMessages } from "@/lib/safety-i18n";
import { useLocationFragment } from "@/lib/use-location-fragment";
import { privacyMessages } from "@/lib/privacy-i18n";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { useLocale } from "@/lib/locale-store";
import { FounderBootstrap } from "./founder-bootstrap";
import { AccountMfa } from "./account-mfa";
import { AccountSecurity } from "./account-security";
import { ActiveSessions } from "./active-sessions";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { FollowRequestsPanel, SocialPrivacySettings } from "./social-privacy-settings";
import { NotificationPreferencesPanel } from "./notifications";
import { MemberSafetySettings } from "./member-safety";
import { GovernanceInvitations } from "./platform-governance";

const card = "min-w-0 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6";
const secondaryAction = "rounded-md border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-3 py-2 text-sm font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-button-hover)]";

const settingsTab = "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=location]:bg-[var(--theme-selected)] aria-[current=location]:text-[var(--theme-link)]";

export function AccountSettings({ subject }: { subject: string }) {
  const [locale] = useLocale();
  const a = accountMessages[locale];
  const fragment = useLocationFragment();
  const tabs = [
    ["security", a.security],
    ["social-privacy", f24Messages[locale].privacy],
    ["notification-preferences", mediaNotificationMessages[locale].preferences],
    ["member-safety", safetyMessages[locale].title],
    ["referrals", a.referrals],
  ] as const;
  const selected = fragment === "follow-requests" ? "social-privacy"
    : tabs.some(([id]) => id === fragment) ? fragment : "security";

  useEffect(() => {
    if (fragment === "follow-requests") document.getElementById(fragment)?.scrollIntoView();
  }, [fragment]);

  return <MemberShell>
    <div className="grid min-w-0 gap-4">
      <div className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <PageHeader className="!rounded-none !border-0 !bg-transparent" title={a.settings} description={a.intro} />
        <nav aria-label={a.settings} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] p-2">
          {tabs.map(([id, label]) => <a key={id} href={`#${id}`} className={settingsTab}
            aria-current={id === selected ? "location" : undefined}>{label}</a>)}
        </nav>
      </div>
      <div id="security" hidden={selected !== "security"}>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
          <div className="grid min-w-0 gap-4">
            <section className={card}>
              <h2 className="text-xl font-semibold">{a.security}</h2>
              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <AccountSecurity />
                <AccountMfa />
              </div>
              <ActiveSessions subject={subject} />
              <FounderBootstrap />
            </section>
            <GovernanceInvitations />
          </div>
          <div className="divide-y divide-[var(--theme-border)] overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
            {[
              { href: "/profile#personal", title: a.personal, help: a.personalHelp },
              { href: "/profile#public-profile", title: a.publicProfile, help: a.publicHelp },
              { href: "/profile#privacy", title: a.privacy, help: a.privacyHelp },
              { href: "/settings/privacy-requests", title: privacyMessages[locale].title, help: privacyMessages[locale].settings },
              { href: "/settings/opportunities", title: publicationCopy(locale)("myInterest"), help: publicationCopy(locale)("interestHelp") },
              { href: "/settings/volunteering", title: volunteerCopy(locale)("title"), help: volunteerCopy(locale)("intro") },
              { href: "/settings/ambassadors", title: ambassadorMessages[locale].myProgram },
            ].map(({ href, title, help }) => (
              <Link key={href} href={href} className="flex min-h-11 min-w-0 items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2">
                <span className="grid min-w-0 gap-1">
                  <span className="break-words text-sm font-semibold text-[var(--theme-link)]">{title}</span>
                  {help && <span className="text-xs leading-relaxed text-[var(--theme-body)]">{help}</span>}
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-[var(--theme-link)]" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div hidden={selected !== "social-privacy"}>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,23rem)]">
          <SocialPrivacySettings />
          <FollowRequestsPanel />
        </div>
      </div>
      <div hidden={selected !== "notification-preferences"}>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2"><NotificationPreferencesPanel /></div>
      </div>
      <div hidden={selected !== "member-safety"}><MemberSafetySettings /></div>
      <div id="referrals" hidden={selected !== "referrals"}>{selected === "referrals" && <AccountCodes />}</div>
    </div>
  </MemberShell>;
}

function AccountCodes() {
  const [locale] = useLocale();
  const a = accountMessages[locale];
  const t = authMessages[locale];
  const router = useRouter();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof fetchAccountCodes>> | null>(null);
  const [invitation, setInvitation] = useState("");
  const [failed, setFailed] = useState(false);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<"copied" | "shareFailed" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadRegistrationPolicy(controller.signal).then((policy) => {
      if (!controller.signal.aborted) setShareAvailable(canRegister(policy) && policy.referralsEnabled && policy.mode === "public");
    }).catch(() => {
      if (!controller.signal.aborted) setShareAvailable(false);
    });
    fetchAccountCodes(controller.signal).then((account) => {
      if (controller.signal.aborted) return;
      const link = new URL("/register", window.location.origin);
      link.searchParams.set("ref", account.referralCode);
      setInvitation(link.href);
      setDetails(account);
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") router.replace("/login");
      else setFailed(true);
    });
    return () => controller.abort();
  }, [retry, router]);

  async function share(native = false) {
    setNotice(null);
    try {
      if (native && navigator.share) await navigator.share({ url: invitation });
      else {
        await navigator.clipboard.writeText(invitation);
        setNotice("copied");
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setNotice("shareFailed");
    }
  }

  return failed ? (
    <div className={card}>
      <p role="alert" className="text-[var(--theme-error-text)]">{t.loadError}</p>
      <button type="button" className={`${secondaryAction} mt-3`} onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>{t.retry}</button>
    </div>
  ) : !details ? <p role="status" className={card}>{t.working}</p> : (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className={card}>
        <h2 className="text-xl font-semibold">{a.privateCode}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{a.privateCodeHelp}</p>
        <code className="mt-4 block break-all rounded-md bg-[var(--theme-control)] p-3 text-sm">{details.memberCode}</code>
      </section>
      <section className={card}>
        <h2 className="text-xl font-semibold">{a.referrals}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{shareAvailable ? a.referralHelp : a.referralSharingUnavailable}</p>
        <code className="mt-4 block break-all font-semibold">{details.referralCode}</code>
        {shareAvailable && <>
        <p className="mt-2 break-all text-sm text-[var(--theme-link)]">{invitation}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={secondaryAction} onClick={() => { void share(); }}>{a.copyLink}</button>
          <button type="button" className={secondaryAction} onClick={() => { void share(true); }}>{a.shareLink}</button>
        </div>
        </>}
        {shareAvailable && notice && <p role="status" className="mt-3 text-sm">{a[notice]}</p>}
        <p className="mt-5 border-t border-[var(--theme-border)] pt-4 text-sm text-[var(--theme-body)]">
          {details.confirmedCount === 0 ? a.emptyReferrals : `${a.confirmedReferrals} · ${new Intl.NumberFormat(locale).format(details.confirmedCount)}`}
        </p>
      </section>
    </div>
  );
}
