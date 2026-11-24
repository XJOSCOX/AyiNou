"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { openPrivateFlow, privateFlowPath } from "@/lib/session-security";
import { browserSupabase } from "@/lib/supabase/browser";
import { DisplayControls } from "./display-controls";
import { InstitutionSwitcher } from "./institution-switcher";
import { AdministratorMark, FounderMark, PersonalClaimChecks } from "./institution-ui";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { SiteBrand } from "./site-brand";
import { NotificationBell } from "./notification-bell";

export function MemberNavbar() {
  const [locale] = useLocale();
  const { memberId, displayName, avatarUrl, claims, administrator, founder, founderVerified, reviewer } = useMemberIdentity();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const settings = accountMessages[locale].settings;
  const auth = authMessages[locale];
  const institution = institutionMessages[locale];
  const menuLabel = displayName || settings;
  const accountLinks = [
    { href: "/profile", label: auth.myProfile },
    { href: "/settings", label: settings },
    { href: "/account-access", label: featureMessages[locale].accountAccess },
    { href: "/verification", label: institution.verification },
  ];
  if (administrator) accountLinks.push({ href: "/admin", label: adminMessages[locale].administration });
  if (reviewer) accountLinks.push({ href: "/verification/review", label: institution.review });
  const router = useRouter();
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    setLogoutFailed(false);
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch { setLogoutFailed(true); }
    finally { setSigningOut(false); }
  }

  return (
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-3 sm:px-6 xl:px-10">
        <div className="justify-self-start"><SiteBrand href="/dashboard" /></div>
        <details ref={accountMenu} className="relative min-w-0 max-w-full justify-self-end" onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.open) {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary className="flex min-h-9 max-w-60 list-none items-center gap-2 rounded-md px-1.5 py-0.5 text-sm font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] [&::-webkit-details-marker]:hidden">
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--theme-selected)] text-[var(--theme-link)]">
              {avatarUrl && avatarUrl !== failedAvatar ? <Image src={avatarUrl} alt="" width={32} height={32}
                className="size-full object-cover" unoptimized onError={() => setFailedAvatar(avatarUrl)} /> :
              <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
              </svg>}
            </span>
            <span className="line-clamp-2 min-w-0 break-words text-start leading-tight sm:line-clamp-none sm:truncate" title={menuLabel}>{menuLabel}</span>
            {displayName && <PersonalClaimChecks claims={claims} />}
            {founder ? <FounderMark compact /> : administrator && <AdministratorMark compact />}
            {founderVerified && <FounderVerifiedMark compact />}
            <span aria-hidden="true" className="me-1 size-1.5 shrink-0 -translate-y-px rotate-45 border-e border-b border-current" />
          </summary>
          <div className="absolute end-0 z-30 mt-2 grid w-56 max-w-[calc(100vw-2rem)] gap-0.5 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5 shadow-lg">
            {accountLinks.map(({ href, label }) => (
              <Link key={href} href={href} prefetch={false} onNavigate={(event) => {
                if (accountMenu.current) accountMenu.current.open = false;
                if (memberId && (href === "/admin" || href === "/verification/review")) {
                  event.preventDefault();
                  const kind = href === "/admin" ? "admin_workspace" : "verification_workspace";
                  void openPrivateFlow(kind, memberId).then(flow => router.push(privateFlowPath(flow)),
                    () => router.push(href));
                }
              }} className="rounded px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)]">
                {label}
              </Link>
            ))}
            <button type="button" onClick={logout} disabled={signingOut} className="rounded px-3 py-2 text-start text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)]">
              {auth.logout}
            </button>
            {logoutFailed && <p role="alert" className="px-3 text-xs text-[var(--theme-error-text)]">{auth.loadError}</p>}
          </div>
        </details>
        <NotificationBell />
        <div className="col-span-3 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-2 sm:col-span-1 sm:border-t-0 sm:pt-0">
          <InstitutionSwitcher />
          <DisplayControls />
        </div>
      </div>
    </header>
  );
}
