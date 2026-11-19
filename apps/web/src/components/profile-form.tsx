"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { interestCodes, type Department, type InterestCode, type MemberProfile, type MembershipCategory, type ProfileChanges } from "@ayinou/shared";
import { fetchDepartments, fetchMyProfile, updateMyProfile, uploadAvatar } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { isLocale, type Locale } from "@/lib/i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { MemberShell } from "./member-shell";

const input = "mt-2 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-control)] px-4 py-3 focus-visible:outline-2 focus-visible:outline-[var(--theme-link)]";
const action = "rounded-xl bg-[var(--theme-primary)] px-5 py-3 font-semibold text-[var(--theme-on-primary)] disabled:opacity-60";
const errorBox = "rounded-xl bg-[var(--theme-error-bg)] p-3 text-sm text-[var(--theme-error-text)]";
const countryOptions = ["HT", "US", "CA", "FR"];
const reserved = ["admin", "support", "ayinou", "system", "root", "moderator", "administrator"];
const validName = (value: string) => value.trim().length >= 1 && value.trim().length <= 80 && !/\p{Cc}/u.test(value.trim());

function usernameSuggestion(displayName: string) {
  const base = displayName.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18);
  return `${base || "member"}_${Math.floor(1000 + Math.random() * 9000)}`;
}

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

  return (
    <MemberShell>
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-9">
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

function ProfileEditor({ profile, departments, onboarding }: {
  profile: MemberProfile; departments: Department[]; onboarding: boolean;
}) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  const m = membershipMessages[locale];
  const router = useRouter();
  const [saved, setSaved] = useState(profile);
  const [step, setStep] = useState(profile.onboardingStep ?? 0);
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [preferredLocale, setPreferredLocale] = useState<Locale>(profile.preferredLocale);
  const [category, setCategory] = useState<MembershipCategory | "">(profile.membershipCategory ?? "");
  const [country, setCountry] = useState(profile.residenceCountryCode ?? "");
  const [countryOption, setCountryOption] = useState(country && !countryOptions.includes(country) ? "other" : country);
  const [department, setDepartment] = useState(profile.residenceDepartmentCode ?? "");
  const [connection, setConnection] = useState(profile.diasporaDepartmentCode ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [biography, setBiography] = useState(profile.biography ?? "");
  const [interests, setInterests] = useState<InterestCode[]>(profile.interests ?? []);
  const [discoverable, setDiscoverable] = useState(profile.discoverable ?? false);
  const [showCategory, setShowCategory] = useState(profile.showMembershipCategory ?? false);
  const [avatar, setAvatar] = useState(profile.avatarUrl);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const all = !onboarding;
  const titles = [m.membership, m.location, m.publicProfile, m.interests];

  async function submit(event?: FormEvent<HTMLFormElement>, skip = false) {
    event?.preventDefault();
    if (busy || uploading) return;
    setError("");
    setSuccess(false);
    const changes: ProfileChanges = {};
    if (all || step === 0) {
      if (!validName(firstName) || !validName(lastName)) { setError(m.invalidPrivateNames); return; }
      if (!category) { setError(m.categoryRequired); return; }
      Object.assign(changes, { firstName: firstName.trim(), lastName: lastName.trim(), membershipCategory: category, preferredLocale });
    }
    if (all || step === 1) {
      const normalized = skip ? "" : country.trim().toUpperCase();
      if (normalized && !/^[A-Z]{2}$/.test(normalized)) { setError(t.countryCodeHint); return; }
      Object.assign(changes, {
        residenceCountryCode: normalized || null,
        residenceDepartmentCode: normalized === "HT" ? department || null : null,
        diasporaDepartmentCode: normalized && normalized !== "HT" ? connection || null : null,
      });
    }
    if (all || step === 2) {
      const normalized = username.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(normalized) || reserved.includes(normalized)) { setError(m.usernameHint); return; }
      if (displayName.trim().length < 2 || displayName.trim().length > 80) { setError(t.invalidName); return; }
      Object.assign(changes, { username: normalized, displayName: displayName.trim(), biography: biography.trim() || null, discoverable, showMembershipCategory: showCategory });
    }
    if (all || step === 3) changes.interests = skip ? [] : interests;
    if (onboarding) changes.onboardingStep = step + 1;
    setBusy(true);
    try {
      const result = await updateMyProfile(changes);
      setSaved(result);
      if (onboarding && step === 0) {
        void browserSupabase().auth.updateUser({ data: { first_name: null, last_name: null } }).catch(() => {});
      }
      if (skip && step === 1) { setCountry(""); setCountryOption(""); setDepartment(""); setConnection(""); }
      if (skip && step === 3) setInterests([]);
      if (changes.preferredLocale && changes.preferredLocale !== locale) setLocale(changes.preferredLocale);
      if (onboarding) setStep(step + 1);
      else setSuccess(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "UNAUTHORIZED") router.replace("/login");
      else setError(code === "USERNAME_TAKEN" ? m.usernameTaken : t.saveError);
    } finally { setBusy(false); }
  }

  async function changePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    setUploading(true);
    try { setAvatar(await uploadAvatar(file)); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "UNAUTHORIZED") router.replace("/login");
      else setPhotoError(code === "INVALID_AVATAR" ? m.photoHint : m.avatarError);
    } finally { setUploading(false); }
  }

  const preview = (
    <section className="mt-7 rounded-2xl bg-[var(--theme-control)] p-5" aria-label={m.preview}>
      <h2 className="font-bold">{m.preview}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{m.previewNote}</p>
      <div className="mt-4 flex items-center gap-4">
        {avatar && <Image src={avatar} alt={m.photoAlt} width={56} height={56} className="rounded-full" unoptimized />}
        <div>
          <p className="font-bold">{saved.displayName}</p>
          {saved.username && <p className="text-sm text-[var(--theme-body)]">@{saved.username}</p>}
        </div>
      </div>
      {saved.biography && <p className="mt-3 whitespace-pre-line break-words text-sm">{saved.biography}</p>}
      {saved.showMembershipCategory && saved.membershipCategory && <p className="mt-2 text-sm text-[var(--theme-link)]">
        {saved.membershipCategory === "haitian" ? m.haitianCount : m.supporterCount}
      </p>}
    </section>
  );

  if (onboarding && step >= 4) return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{m.welcome.replace("{name}", saved.displayName ?? "")}</h1>
      <p className="mt-3 text-[var(--theme-body)]">{m.summary}</p>
      {preview}
      <p className="mt-6 text-sm text-[var(--theme-body)]">{m.upcoming}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Link className={action} href="/dashboard">{m.stats}</Link>
        <Link className="font-semibold text-[var(--theme-link)] underline" href="/profile">{t.myProfile}</Link>
      </div>
    </>
  );

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{onboarding ? t.onboardingTitle : t.profileTitle}</h1>
      {onboarding && <ol className="my-5 grid grid-cols-2 gap-2 text-xs font-semibold sm:grid-cols-4">
        {titles.map((title, index) => <li key={title} aria-current={index === step ? "step" : undefined}
          className={`rounded-lg px-3 py-2 ${index === step ? "bg-[var(--theme-selected)]" : "bg-[var(--theme-control)]"}`}>{title}</li>)}
      </ol>}
      <form className="mt-6 space-y-7" onSubmit={submit} aria-busy={busy || uploading} noValidate>
        {(all || step === 0) && <fieldset className="space-y-4">
          <legend className="text-lg font-bold">{m.connectionQuestion}</legend>
          <p className="mt-2 text-sm text-[var(--theme-body)]">{m.membershipNote}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["haitian", m.haitian], ["international_supporter", m.supporter]] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 rounded-xl border border-[var(--theme-border)] p-3">
                <input type="radio" name="membership" value={value} checked={category === value} onChange={() => setCategory(value)} required />{label}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>{m.firstName}<input className={input} autoComplete="given-name" maxLength={80} value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
            <label>{m.lastName}<input className={input} autoComplete="family-name" maxLength={80} value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
          </div>
          <p className="text-xs text-[var(--theme-body)]">{m.privateNames}</p>
          <label className="block">{t.preferredLanguage}
            <select className={input} value={preferredLocale} onChange={(e) => { if (isLocale(e.target.value)) setPreferredLocale(e.target.value); }}>
              <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option>
            </select>
          </label>
        </fieldset>}

        {(all || step === 1) && <fieldset className="space-y-4">
          <legend className="text-lg font-bold">{m.location}</legend>
          <label className="mt-3 block">{t.country}
            <select className={input} value={countryOption} onChange={(e) => {
              const value = e.target.value;
              setCountryOption(value);
              setCountry(value === "other" ? "" : value);
            }}>
              <option value="">{t.countryPlaceholder}</option>
              {countryOptions.map((value, index) => <option value={value} key={value}>{[t.haiti, t.unitedStates, t.canada, t.france][index]}</option>)}
              <option value="other">{t.otherCountry}</option>
            </select>
          </label>
          {countryOption === "other" && <label className="block">{t.otherCountry}<input className={input} value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label>}
          {country && <label className="block">{country === "HT" ? t.departmentResidence : t.departmentConnection}
            <select className={input} value={country === "HT" ? department : connection} onChange={(e) => {
              if (country === "HT") setDepartment(e.target.value); else setConnection(e.target.value);
            }}>
              <option value="">{t.departmentPlaceholder}</option>
              {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>}
          <p className="text-xs text-[var(--theme-body)]">{t.privateNote}</p>
        </fieldset>}

        {(all || step === 2) && <fieldset className="space-y-4">
          <legend className="text-lg font-bold">{m.publicProfile}</legend>
          <label className="mt-3 block">{t.displayName}<input className={input} autoComplete="nickname" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
          <label className="block">{m.username}<input className={input} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby="username-hint" maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
          <p id="username-hint" className="text-xs text-[var(--theme-body)]">{m.usernameHint}</p>
          <button type="button" className="text-sm font-semibold text-[var(--theme-link)] underline" onClick={() => setUsername(usernameSuggestion(displayName))}>{m.suggestion}</button>
          <label className="block">{m.biography}<textarea className={input} rows={3} value={biography} onChange={(e) => setBiography(e.target.value)} maxLength={320} /></label>
          <div>
            <label className="block">{m.photo}
              <input type="file" className={input} accept="image/jpeg,image/png,image/webp" disabled={uploading || busy}
                aria-label={m.addPhoto} aria-describedby="avatar-hint" onChange={(e) => { void changePhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p id="avatar-hint" className="mt-1 text-xs text-[var(--theme-body)]">{m.photoHint}</p>
            {uploading && <p role="status">{t.working}</p>}
            {photoError && <p role="alert" className={`mt-2 ${errorBox}`}>{photoError}</p>}
            {avatar && <Image src={avatar} width={56} height={56} alt={m.photoAlt} className="mt-3 rounded-full" unoptimized />}
          </div>
          <fieldset className="space-y-2 rounded-xl border border-[var(--theme-border)] p-3">
            <legend className="px-1 font-semibold">{m.privacy}</legend>
            <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />{m.discoverable}</label>
            <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={showCategory} onChange={(e) => setShowCategory(e.target.checked)} />{m.showCategory}</label>
          </fieldset>
        </fieldset>}

        {(all || step === 3) && <fieldset>
          <legend className="text-lg font-bold">{m.interests}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {interestCodes.map((code) => <label className="flex items-center gap-2 rounded-lg bg-[var(--theme-control)] p-3" key={code}>
              <input type="checkbox" checked={interests.includes(code)} onChange={(e) =>
                setInterests(e.target.checked ? [...interests, code] : interests.filter((item) => item !== code))} />
              {m[code]}
            </label>)}
          </div>
        </fieldset>}

        {error && <p role="alert" className={errorBox}>{error}</p>}
        {success && <p role="status" className="text-[var(--theme-link)]">{t.saved}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy || uploading} className={action}>{busy ? t.working : all ? t.saveProfile : step === 3 ? m.finish : m.continue}</button>
          {onboarding && (step === 1 || step === 3) && <button type="button" disabled={busy || uploading} className="font-semibold underline" onClick={() => { void submit(undefined, true); }}>{m.skip}</button>}
          {onboarding && step > 0 && <button type="button" disabled={busy || uploading} className="font-semibold underline" onClick={() => { setError(""); setStep(step - 1); }}>{m.back}</button>}
        </div>
      </form>
      {all && preview}
    </>
  );
}
