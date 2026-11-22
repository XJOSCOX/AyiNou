"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { fetchAccountCodes } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { privacyMessages } from "@/lib/privacy-i18n";
import { useLocale } from "@/lib/locale-store";
import { FounderBootstrap } from "./founder-bootstrap";
import { AccountMfa } from "./account-mfa";
import { AccountSecurity } from "./account-security";
import { ActiveSessions } from "./active-sessions";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { NotificationPreferencesPanel } from "./notifications";
import { MemberSafetySettings } from "./member-safety";
import { GovernanceInvitations } from "./platform-governance";

const card = "min-w-0 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6";
const secondaryAction = "rounded-md border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-3 py-2 text-sm font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-button-hover)]";

export function AccountSettings({ subject }: { subject: string }) {
  const [locale] = useLocale();
  const a = accountMessages[locale];
  const t = authMessages[locale];
  const router = useRouter();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof fetchAccountCodes>> | null>(null);
  const [invitation, setInvitation] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<"copied" | "shareFailed" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
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

  return (
    <MemberShell>
      <div className="grid gap-5">
        <PageHeader title={a.settings} description={a.intro} />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { href: "/profile#personal", title: a.personal, help: a.personalHelp },
            { href: "/profile#public-profile", title: a.publicProfile, help: a.publicHelp },
            { href: "/profile#privacy", title: a.privacy, help: a.privacyHelp },
            { href: "/settings/privacy-requests", title: privacyMessages[locale].title, help: privacyMessages[locale].settings },
          ].map(({ href, title, help }) => (
            <Link key={href} href={href} className={`${card} block hover:border-[var(--theme-link)]`}>
              <h2 className="font-semibold text-[var(--theme-link)]">{title} <span aria-hidden="true">↗</span></h2>
              <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{help}</p>
            </Link>
          ))}
        </div>
        <section className={card}>
          <h2 className="text-xl font-semibold">{a.security}</h2>
          <AccountSecurity />
          <AccountMfa />
          <ActiveSessions subject={subject} />
          <FounderBootstrap />
        </section>
        <NotificationPreferencesPanel />
        <MemberSafetySettings />
        <GovernanceInvitations />
        <Link href="/settings/ambassadors" className={`${secondaryAction} justify-self-start`}>{ambassadorMessages[locale].myProgram}</Link>
        {failed ? (
          <div className={card}>
            <p role="alert" className="text-[var(--theme-error-text)]">{t.loadError}</p>
            <button type="button" className={`${secondaryAction} mt-3`} onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>{t.retry}</button>
          </div>
        ) : !details ? <p role="status">{t.working}</p> : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section className={card}>
              <h2 className="text-xl font-semibold">{a.privateCode}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{a.privateCodeHelp}</p>
              <code className="mt-4 block break-all rounded-md bg-[var(--theme-control)] p-3 text-sm">{details.memberCode}</code>
            </section>
            <section className={card}>
              <h2 className="text-xl font-semibold">{a.referrals}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{a.referralHelp}</p>
              <code className="mt-4 block break-all font-semibold">{details.referralCode}</code>
              <p className="mt-2 break-all text-sm text-[var(--theme-link)]">{invitation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondaryAction} onClick={() => { void share(); }}>{a.copyLink}</button>
                <button type="button" className={secondaryAction} onClick={() => { void share(true); }}>{a.shareLink}</button>
              </div>
              {notice && <p role="status" className="mt-3 text-sm">{a[notice]}</p>}
              <p className="mt-5 border-t border-[var(--theme-border)] pt-4 text-sm text-[var(--theme-body)]">
                {details.confirmedCount === 0 ? a.emptyReferrals : `${a.confirmedReferrals} · ${new Intl.NumberFormat(locale).format(details.confirmedCount)}`}
              </p>
            </section>
          </div>
        )}
      </div>
    </MemberShell>
  );
}
