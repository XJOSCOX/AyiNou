"use client";

import Link from "next/link";
import type { FeatureNotice, MemberAccountEnforcement } from "@ayinou/shared";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { publicContactEmail } from "@/lib/public-contact";
import { DisplayControls } from "./display-controls";
import { PageHeader } from "./page-header";
import { SiteBrand } from "./site-brand";
import { institutionAction, institutionCard, institutionErrorBox, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberAppeals } from "./enforcement-appeals";
import { EnforcementDetails } from "./account-enforcement-details";

const accessAction = "inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-start text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";

async function readEnforcement(signal: AbortSignal) {
  const { data, error } = await browserSupabase().rpc("m22_my_account_enforcement").abortSignal(signal);
  if (error) throw error;
  return { value: data as MemberAccountEnforcement | null };
}

async function readFeatures(signal: AbortSignal) {
  const { data, error } = await browserSupabase().rpc("m23_my_feature_notices").abortSignal(signal);
  if (error) throw error;
  return { value: data as FeatureNotice[] | null };
}

export function RestrictedSession({ signedIn }: { signedIn: boolean }) {
  const [locale] = useLocale();
  const copy = accountEnforcementMessages[locale];
  const t = authMessages[locale];
  return <div className="min-h-dvh text-[var(--theme-text)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:px-6 xl:px-10">
      <SiteBrand />
      <DisplayControls />
    </header>
    <main className="grid min-w-0 gap-4 px-4 py-5 sm:px-6 sm:py-7 xl:px-10">
      {signedIn ? <AccountAccessDetails /> : <>
        <PageHeader title={featureMessages[locale].accountAccess} description={copy.signInForNotices}
          actions={<Link className={institutionAction} href="/login">{t.login}</Link>} />
        <AccessHelp />
      </>}
    </main>
  </div>;
}

function AccessHelp({ children }: { children?: ReactNode }) {
  const [locale] = useLocale();
  const copy = accountEnforcementMessages[locale];
  return <section className={institutionCard + " grid gap-3"} aria-labelledby="account-access-help">
    <h2 id="account-access-help" className="text-lg font-semibold">{copy.helpTitle}</h2>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link className={accessAction} href="/forgot-password">{copy.security}</Link>
      <a className={accessAction} href={`mailto:${publicContactEmail}`}>{copy.support}</a>
    </div>
    {children}
  </section>;
}

function AccountAccessDetails() {
  const [locale] = useLocale();
  const t = authMessages[locale];
  const admin = adminMessages[locale];
  const copy = accountEnforcementMessages[locale];
  const feature = featureMessages[locale];
  const notice = useInstitutionResource(readEnforcement);
  const features = useInstitutionResource(readFeatures);
  const account = notice.data?.value;
  const featureNotices = features.data?.value;
  const canResume = account?.canResume === true;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader
      title={account?.canResume === false ? admin.restrictedTitle : feature.accountAccess}
      description={account?.canResume === false ? admin.restrictedHelp : copy.noticeHelp}
      actions={canResume && <Link className={institutionAction} href="/dashboard">{t.dashboard}</Link>}
    />
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(19rem,1fr)]">
      <div className="grid min-w-0 gap-4">
        <section className={institutionCard + " grid gap-3"} aria-labelledby="account-notices">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="account-notices" className="text-lg font-semibold">{copy.noticesTitle}</h2>
            {account?.notices.some((item) => item.status === "active") && <a href="#account-appeals"
              className={accessAction}>
              {copy.appealOptions}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m-5-5 5 5 5-5" /></svg>
            </a>}
          </div>
          {notice.error !== null ? <div role="status" className="space-y-2 text-sm">
            <p>{copy.unavailable}</p>
            <button type="button" className={institutionLink} onClick={notice.refresh}>{t.retry}</button>
          </div> : !notice.data ? <p role="status" className="text-sm">{t.working}</p>
            : !account || account.notices.length === 0 ? <p className="text-sm text-[var(--theme-body)]">{canResume ? copy.noActiveNotices : copy.noNotice}</p>
              : <ul className="grid gap-3">
                {account.notices.map((item) => <li key={item.reference} className="rounded-lg border border-[var(--theme-border)] p-3">
                  <EnforcementDetails notice={item} memberView />
                </li>)}
              </ul>}
        </section>
        {account && <div id="account-appeals" className="scroll-mt-4"><MemberAppeals /></div>}
      </div>
      <div className="grid min-w-0 gap-4">
        {account && <section className={institutionCard + " grid gap-3"} aria-labelledby="feature-notices">
          <h2 id="feature-notices" className="text-lg font-semibold">{feature.features}</h2>
          {features.error !== null ? <div role="status" className="space-y-2 text-sm">
            <p>{copy.unavailable}</p>
            <button type="button" className={institutionLink} onClick={features.refresh}>{t.retry}</button>
          </div> : !features.data ? <p role="status" className="text-sm">{t.working}</p>
            : !featureNotices ? <p className="text-sm">{copy.unavailable}</p>
              : featureNotices.length === 0 ? <p className="text-sm text-[var(--theme-body)]">{feature.none}</p>
                : <ul className="grid gap-3">
                  {featureNotices.map((item) => <li key={item.id} className="grid min-w-0 gap-1 rounded-lg border border-[var(--theme-border)] p-3 text-sm">
                    <strong>{feature[item.capability]} · {feature[item.status]}</strong>
                    <p>{feature[item.scope]}{item.scopeId && <span className="break-all"> · {item.scopeId}</span>}</p>
                    {item.category && <p>{copy[item.category]}</p>}
                    <p><time dateTime={item.startsAt}>{date.format(new Date(item.startsAt))}</time> – {item.expiresAt
                      ? <time dateTime={item.expiresAt}>{date.format(new Date(item.expiresAt))}</time> : feature.indefinitely}</p>
                    <p className="break-all">{copy.reference} · {item.id}</p>
                  </li>)}
                </ul>}
        </section>}
        <AccessHelp>
          {failed && <p role="alert" className={institutionErrorBox}>{t.loadError}</p>}
          <button type="button" disabled={busy} onClick={() => { void signOut(); }}
            className={accessAction + " justify-self-start"}>
            {t.logout}
          </button>
        </AccessHelp>
      </div>
    </div>
  </>;
}
