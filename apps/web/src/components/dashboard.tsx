"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MemberProfile } from "@ayinou/shared";
import { fetchMyProfile } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { MemberShell } from "./member-shell";

export function Dashboard() {
  const [locale] = useLocale();
  const t = authMessages[locale];
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMyProfile().then((loaded) => {
      if (!loaded.displayName) { router.replace("/onboarding"); return; }
      setProfile(loaded);
    }).catch((cause) => {
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") { router.replace("/login"); return; }
      setError(t.loadError);
    });
  }, [router, t.loadError]);

  return <MemberShell>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : !profile ? <p role="status">{t.working}</p> : (
      <div className="rounded-[2rem] bg-[#174e41] p-8 text-white sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e8be75]">AYINOU</p>
        <h1 className="mt-5 font-serif text-4xl sm:text-5xl">{t.dashboardTitle.replace("{name}", profile.displayName ?? "")}</h1>
        <p className="mt-5 max-w-xl leading-8 text-[#d5e4db]">{t.dashboardIntro}</p>
        <Link href="/profile" className="mt-8 inline-block rounded-full bg-white px-6 py-3 font-bold text-[#174e41]">{t.myProfile} ↗</Link>
      </div>
    )}
  </MemberShell>;
}
