"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Department, MemberProfile, UpdateMemberProfile } from "@ayinou/shared";
import { fetchDepartments, fetchMyProfile, updateMyProfile } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { MemberShell } from "./member-shell";

const inputClass = "mt-2 w-full rounded-xl border border-[#bccbc0] bg-white px-4 py-3 outline-none focus:border-[#155746] focus:ring-2 focus:ring-[#155746]/20";

export function ProfileForm({ onboarding }: { onboarding: boolean }) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<UpdateMemberProfile["preferredLocale"]>("ht");
  const [countryOption, setCountryOption] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const [residenceDepartment, setResidenceDepartment] = useState("");
  const [diasporaDepartment, setDiasporaDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const [loadedProfile, loadedDepartments, userResult] = await Promise.all([
        fetchMyProfile(), fetchDepartments(), browserSupabase().auth.getUser(),
      ]);
      setProfile(loadedProfile);
      setDepartments(loadedDepartments);
      setDisplayName(loadedProfile.displayName ?? String(userResult.data.user?.user_metadata?.display_name ?? ""));
      const savedLocale = loadedProfile.displayName ? loadedProfile.preferredLocale : locale;
      setPreferredLocale(savedLocale);
      if (loadedProfile.displayName) setLocale(savedLocale);
      const country = loadedProfile.residenceCountryCode ?? "";
      setCountryOption(["", "HT", "US", "CA", "FR"].includes(country) ? country : "OTHER");
      setOtherCountry(["", "HT", "US", "CA", "FR"].includes(country) ? "" : country);
      setResidenceDepartment(loadedProfile.residenceDepartmentCode ?? "");
      setDiasporaDepartment(loadedProfile.diasporaDepartmentCode ?? "");
    } catch (cause) {
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") { router.replace("/login"); return; }
      setError(t.loadError);
    } finally { setLoading(false); }
  }, [locale, router, setLocale, t.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const name = displayName.trim();
    if (name.length < 2 || name.length > 80) { setError(t.invalidName); return; }
    const country = countryOption === "OTHER" ? otherCountry.trim().toUpperCase() : countryOption;
    if (countryOption === "OTHER" && !/^[A-Z]{2}$/.test(country)) { setError(t.countryCodeHint); return; }
    setSaving(true);
    try {
      await updateMyProfile({
        displayName: name,
        preferredLocale,
        residenceCountryCode: country || null,
        residenceDepartmentCode: country === "HT" ? residenceDepartment || null : null,
        diasporaDepartmentCode: country && country !== "HT" ? diasporaDepartment || null : null,
      });
      setLocale(preferredLocale);
      setSuccess(t.saved);
      if (onboarding) { router.replace("/dashboard"); router.refresh(); }
    } catch (cause) {
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") { router.replace("/login"); return; }
      setError(t.saveError);
    } finally { setSaving(false); }
  }

  return (
    <MemberShell>
      <div className="rounded-[2rem] border border-[#d8dfd1] bg-white p-6 shadow-lg shadow-[#174e41]/10 sm:p-10">
        <h1 className="font-serif text-4xl">{onboarding ? t.onboardingTitle : t.profileTitle}</h1>
        <p className="mt-3 text-sm leading-7 text-[#587067]">{onboarding ? t.onboardingIntro : t.profileIntro}</p>
        {loading ? <p role="status" className="mt-8">{t.working}</p> : !profile ? (
          <div className="mt-8"><p role="alert" className="text-red-800">{error || t.loadError}</p>
            <button type="button" onClick={() => { setLoading(true); setError(""); void load(); }} className="mt-4 font-bold underline">{t.retry}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold sm:col-span-2" htmlFor="profile-name">{t.displayName}
              <input id="profile-name" className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={80} autoComplete="nickname" />
            </label>
            <label className="block text-sm font-semibold" htmlFor="profile-locale">{t.preferredLanguage}
              <select id="profile-locale" className={inputClass} value={preferredLocale} onChange={(e) => setPreferredLocale(e.target.value as UpdateMemberProfile["preferredLocale"])}>
                <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-semibold" htmlFor="profile-country">{t.country}
              <select id="profile-country" className={inputClass} value={countryOption} onChange={(e) => setCountryOption(e.target.value)}>
                <option value="">{t.countryPlaceholder}</option>
                <option value="HT">{t.haiti}</option><option value="US">{t.unitedStates}</option>
                <option value="CA">{t.canada}</option><option value="FR">{t.france}</option>
                <option value="OTHER">{t.otherCountry}</option>
              </select>
            </label>
            {countryOption === "OTHER" && <label className="block text-sm font-semibold sm:col-span-2" htmlFor="profile-other-country">{t.otherCountry}
              <input id="profile-other-country" className={inputClass} value={otherCountry} onChange={(e) => setOtherCountry(e.target.value.toUpperCase())} maxLength={2} pattern="[A-Z]{2}" />
              <span className="mt-1 block text-xs font-normal text-[#6a8075]">{t.countryCodeHint}</span>
            </label>}
            {countryOption === "HT" && <label className="block text-sm font-semibold sm:col-span-2" htmlFor="residence-department">{t.departmentResidence}
              <select id="residence-department" className={inputClass} value={residenceDepartment} onChange={(e) => setResidenceDepartment(e.target.value)}>
                <option value="">{t.departmentPlaceholder}</option>
                {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </label>}
            {countryOption && countryOption !== "HT" && <label className="block text-sm font-semibold sm:col-span-2" htmlFor="diaspora-department">{t.departmentConnection}
              <select id="diaspora-department" className={inputClass} value={diasporaDepartment} onChange={(e) => setDiasporaDepartment(e.target.value)}>
                <option value="">{t.departmentPlaceholder}</option>
                {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </label>}
            <p className="text-xs leading-6 text-[#587067] sm:col-span-2">{t.privateNote}</p>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{error}</p>}
            {success && <p role="status" className="rounded-xl bg-[#edf4eb] p-3 text-sm text-[#155746] sm:col-span-2">{success}</p>}
            <button type="submit" disabled={saving} className="rounded-full bg-[#155746] px-7 py-3.5 font-bold text-white disabled:opacity-60 sm:col-span-2">
              {saving ? t.working : t.saveProfile}
            </button>
          </form>
        )}
      </div>
    </MemberShell>
  );
}
