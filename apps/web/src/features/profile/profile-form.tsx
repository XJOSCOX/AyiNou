import { ProfileEditor } from "./profile-editor";
import { errorBox, action } from "./profile-styles";
import { MemberShell } from "@/components/member-shell";
import { fetchMyProfile, fetchDepartments } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { isLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { type MemberProfile, type Department } from "@ayinou/shared";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export function ProfileForm({ onboarding }: { onboarding: boolean }) {
  const [locale] = useLocale();
  const t = authMessages[locale];
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ profile: MemberProfile; departments: Department[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyProfile(), fetchDepartments(), browserSupabase().auth.getUser()]).then(([profile, departments, session]) => {
      if (cancelled) return;
      const metadata = session.data.user?.user_metadata ?? {};
      const name = (key: string) => typeof metadata[key] === "string" ? metadata[key].slice(0, 80) : "";
      const registrationLocale = typeof metadata.preferred_locale === "string" && isLocale(metadata.preferred_locale) ? metadata.preferred_locale : null;
      setLoaded({
        departments,
        profile: {
          ...profile,
          firstName: profile.firstName ?? name("first_name"),
          lastName: profile.lastName ?? name("last_name"),
          displayName: profile.displayName ?? name("display_name"),
          preferredLocale: profile.displayName ? profile.preferredLocale : registrationLocale ?? profile.preferredLocale,
        },
      });
    }).catch((cause) => {
      if (cancelled) return;
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") router.replace("/login");
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [retry, router]);

  useEffect(() => {
    if (!loaded || onboarding) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loaded, onboarding]);

  return (
    <MemberShell>
      <div className={onboarding ? "min-w-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-9" : "min-w-0"}>
        {loaded ? <ProfileEditor {...loaded} onboarding={onboarding} /> : failed ? (
          <>
            <p role="alert" className={errorBox}>{t.loadError}</p>
            <button className={`mt-4 ${action}`} onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>{t.retry}</button>
          </>
        ) : <p role="status">{t.working}</p>}
      </div>
    </MemberShell>
  );
}
