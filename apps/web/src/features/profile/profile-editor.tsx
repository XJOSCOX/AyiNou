import { countryOptions, ProfileLocation } from "./profile-location";
import { DraftProfilePreview, SavedProfilePreview } from "./profile-preview";
import { action, input, errorBox, profileCard } from "./profile-styles";
import { useProfileAvatar } from "./use-profile-avatar";
import { PageHeader } from "@/components/page-header";
import { accountMessages } from "@/lib/account-i18n";
import { updateMyProfile } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { type Locale, isLocale, locales, languageNames } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { membershipMessages } from "@/lib/membership-i18n";
import { browserSupabase } from "@/lib/supabase/browser";
import { type MemberProfile, type Department, type MembershipCategory, type InterestCode, type ProfileChanges, interestCodes } from "@ayinou/shared";
import Image from "next/image";
import Link from "next/link";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { UsernameField, useUsernameAvailability } from "@/components/username-field";
import { usernameMessages } from "@/lib/username-i18n";
import { normalizePublicUsername, publicUsernamePattern } from "@ayinou/shared";

const validName = (value: string) => value.trim().length >= 1 && value.trim().length <= 80 && !/\p{Cc}/u.test(value.trim());

export function ProfileEditor({ profile, departments, onboarding, useSignupDefaults = false }: {
  profile: MemberProfile; departments: Department[]; onboarding: boolean; useSignupDefaults?: boolean;
}) {
  const [locale, setLocale] = useLocale();
  const { claims, administrator, founder, founderVerified, setAvatarUrl } = useMemberIdentity();
  const t = authMessages[locale];
  const account = accountMessages[locale];
  const m = membershipMessages[locale];
  const errors = {
    invalidPrivateNames: m.invalidPrivateNames, categoryRequired: m.categoryRequired, countryCodeHint: t.countryCodeHint,
    usernameHint: usernameMessages[locale].invalid, invalidName: t.invalidName, usernameTaken: m.usernameTaken, saveError: t.saveError,
    usernameConfirm: usernameMessages[locale].confirm, usernameBlocked: usernameMessages[locale].blocked,
    usernameLimit: usernameMessages[locale].limit,
  };
  const router = useRouter();
  const [saved, setSaved] = useState(profile);
  const [step, setStep] = useState(profile.onboardingStep ?? 0);
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [preferredLocaleChoice, setPreferredLocale] = useState<Locale | null>(null);
  const preferredLocale = preferredLocaleChoice ?? (onboarding && step === 0 && !useSignupDefaults ? locale : saved.preferredLocale);
  const [category, setCategory] = useState<MembershipCategory | "">(profile.membershipCategory ?? "");
  const [country, setCountry] = useState(profile.residenceCountryCode ?? "");
  const [countryOption, setCountryOption] = useState(country && !countryOptions.includes(country) ? "other" : country);
  const [department, setDepartment] = useState(profile.residenceDepartmentCode ?? "");
  const [connection, setConnection] = useState(profile.diasporaDepartmentCode ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const changingUsername = normalizePublicUsername(username) !== saved.username;
  const usernameCheck = useUsernameAvailability(username, changingUsername && (!onboarding || step === 2));
  const [confirmedUsername, setConfirmedUsername] = useState<string | null>(null);
  const [biography, setBiography] = useState(profile.biography ?? "");
  const [interests, setInterests] = useState<InterestCode[]>(profile.interests ?? []);
  const [discoverable, setDiscoverable] = useState(profile.discoverable ?? false);
  const [showCategory, setShowCategory] = useState(profile.showMembershipCategory ?? false);
  const [error, setError] = useState<keyof typeof errors | "">("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const { avatar, photoError, uploading, changePhoto } = useProfileAvatar(
    profile.avatarUrl, setAvatarUrl, () => router.replace("/login"),
  );
  const previewProps = { locale, saved, avatar, claims, administrator, founder, founderVerified };
  const all = !onboarding;
  const titles = [m.membership, m.location, m.publicProfile, m.interests];

  async function submit(event?: FormEvent<HTMLFormElement>, skip = false) {
    event?.preventDefault();
    if (busy || uploading) return;
    setError("");
    setSuccess(false);
    const changes: ProfileChanges = {};
    if (all || step === 0) {
      if (!validName(firstName) || !validName(lastName)) { setError("invalidPrivateNames"); return; }
      if (!category) { setError("categoryRequired"); return; }
      Object.assign(changes, { firstName: firstName.trim(), lastName: lastName.trim(), membershipCategory: category, preferredLocale });
    }
    if (all || step === 1) {
      const normalized = skip ? "" : country.trim().toUpperCase();
      if (normalized && !/^[A-Z]{2}$/.test(normalized)) { setError("countryCodeHint"); return; }
      Object.assign(changes, {
        residenceCountryCode: normalized || null,
        residenceDepartmentCode: normalized === "HT" ? department || null : null,
        diasporaDepartmentCode: normalized && normalized !== "HT" ? connection || null : null,
      });
    }
    if (all || step === 2) {
      if (changingUsername && !publicUsernamePattern.test(usernameCheck.candidate)) { setError("usernameHint"); return; }
      if (changingUsername && saved.username && confirmedUsername !== usernameCheck.candidate) { setError("usernameConfirm"); return; }
      const publicName = useSignupDefaults ? usernameCheck.candidate : displayName.trim();
      if (publicName.length < 2 || publicName.length > 80) { setError("invalidName"); return; }
      Object.assign(changes, { displayName: publicName, biography: biography.trim() || null, discoverable, showMembershipCategory: showCategory });
      if (changingUsername) changes.username = usernameCheck.candidate;
    }
    if (all || step === 3) changes.interests = skip ? [] : interests;
    if (onboarding) changes.onboardingStep = step + 1;
    setBusy(true);
    try {
      const result = await updateMyProfile(changes);
      setSaved(result);
      if (changes.username) {
        setUsername(result.username ?? "");
        setDisplayName(result.displayName ?? "");
        setConfirmedUsername(null);
      }
      if (onboarding && step === 0) {
        void browserSupabase().auth.updateUser({ data: { first_name: null, last_name: null } }).catch(() => {});
      }
      if (skip && step === 1) { setCountry(""); setCountryOption(""); setDepartment(""); setConnection(""); }
      if (skip && step === 3) setInterests([]);
      if (changes.preferredLocale && changes.preferredLocale !== locale) setLocale(changes.preferredLocale);
      if (onboarding) setStep(step + 1);
      else setSuccess(true);
      if (changes.displayName !== undefined) router.refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "UNAUTHORIZED") router.replace("/login");
      else if (code === "USERNAME_TAKEN") setError("usernameTaken");
      else if (code === "USERNAME_NOT_PERMITTED") setError("usernameBlocked");
      else if (code === "USERNAME_CHANGE_LIMIT") setError("usernameLimit");
      else setError("saveError");
    } finally { setBusy(false); }
  }

  const profileSections = [
    ["public-profile", m.publicProfile],
    ["personal", account.personal],
    ["location", m.location],
    ["privacy", m.privacy],
    ["interests", m.interests],
  ] as const;
  if (onboarding && step >= 4) return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{m.welcome.replace("{name}", saved.displayName ?? "")}</h1>
      <p className="mt-3 text-[var(--theme-body)]">{m.summary}</p>
      <SavedProfilePreview {...previewProps} />
      <p className="mt-6 text-sm text-[var(--theme-body)]">{m.upcoming}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Link className={action} href="/dashboard">{m.stats}</Link>
        <Link className="font-semibold text-[var(--theme-link)] underline" href="/organization-onboarding">{organizationOnboardingMessages[locale].resume}</Link>
        <Link className="font-semibold text-[var(--theme-link)] underline" href="/profile">{t.myProfile}</Link>
      </div>
    </>
  );

  const privacyFields = (
    <fieldset className={all ? "space-y-3" : "space-y-2 rounded-xl border border-[var(--theme-border)] p-3"}>
      <legend className={all ? "sr-only" : "px-1 font-semibold"}>{m.privacy}</legend>
      <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />{m.discoverable}</label>
      <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={showCategory} onChange={(e) => setShowCategory(e.target.checked)} />{m.showCategory}</label>
    </fieldset>
  );

  const personalFields = (
    <fieldset className="space-y-4">
      <legend className={all ? "text-sm font-semibold" : "text-lg font-bold"}>{m.connectionQuestion}</legend>
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
          {locales.map((option) => <option key={option} value={option} lang={option}>{languageNames[option]}</option>)}
        </select>
      </label>
    </fieldset>
  );

  const locationFields = (
    <ProfileLocation locale={locale} all={all} country={country} countryOption={countryOption}
      department={department} connection={connection} departments={departments} setCountry={setCountry}
      setCountryOption={setCountryOption} setDepartment={setDepartment} setConnection={setConnection} />
  );

  const publicFields = (
    <fieldset className="space-y-4">
      <legend className={all ? "sr-only" : "text-lg font-bold"}>{m.publicProfile}</legend>
      <div className={all ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
        {!useSignupDefaults && <label className="block">{t.displayName}<input className={input} autoComplete="nickname" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>}
        <UsernameField value={username} onChange={(value) => { setUsername(value); setConfirmedUsername(null); }}
          check={usernameCheck} className={input} existing={!!saved.username} />
      </div>
      {saved.username && changingUsername && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmedUsername === usernameCheck.candidate}
          onChange={(event) => setConfirmedUsername(event.target.checked ? usernameCheck.candidate : null)} />
        {usernameMessages[locale].confirm}
      </label>}
      <label className="block">{m.biography}<textarea className={input} rows={3} value={biography} onChange={(e) => setBiography(e.target.value)} maxLength={320} /></label>
      <div>
        <p>{m.photo}</p>
        <label className="mt-2 inline-flex">
          <input type="file" className="peer sr-only" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy}
            aria-label={m.addPhoto} aria-describedby="avatar-hint" onChange={(e) => { void changePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="cursor-pointer rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] peer-focus-visible:outline-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60">{m.addPhoto}</span>
        </label>
        <p id="avatar-hint" className="mt-1 text-xs text-[var(--theme-body)]">{m.photoHint}</p>
        {uploading && <p role="status">{t.working}</p>}
        {photoError && <p role="alert" className={`mt-2 ${errorBox}`}>{m[photoError]}</p>}
        {avatar && <Image src={avatar} width={56} height={56} alt={m.photoAlt} className="mt-3 rounded-full" unoptimized />}
      </div>
      {onboarding && privacyFields}
    </fieldset>
  );

  const interestFields = (
    <fieldset>
      <legend className={all ? "sr-only" : "text-lg font-bold"}>{m.interests}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {interestCodes.map((code) => <label className="flex items-center gap-2 rounded-lg bg-[var(--theme-control)] p-3" key={code}>
          <input type="checkbox" checked={interests.includes(code)} onChange={(e) =>
            setInterests(e.target.checked ? [...interests, code] : interests.filter((item) => item !== code))} />
          {m[code]}
        </label>)}
      </div>
    </fieldset>
  );
  const sectionFields = {
    "public-profile": publicFields,
    personal: personalFields,
    location: locationFields,
    privacy: privacyFields,
    interests: interestFields,
  };

  return (
    <>
      {onboarding ? <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.onboardingTitle}</h1> :
        <PageHeader title={t.profileTitle} description={t.profileIntro} />}
      {onboarding && <ol className="my-5 grid grid-cols-2 gap-2 text-xs font-semibold sm:grid-cols-4">
        {titles.map((title, index) => <li key={title} aria-current={index === step ? "step" : undefined}
          className={`rounded-lg px-3 py-2 ${index === step ? "bg-[var(--theme-selected)]" : "bg-[var(--theme-control)]"}`}>{title}</li>)}
      </ol>}
      <div className={all ? "mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]" : ""}>
        {all && <div className="self-start xl:col-start-2 xl:row-start-1 xl:sticky xl:top-5"><DraftProfilePreview {...previewProps} displayName={displayName} username={username} biography={biography}
            showCategory={showCategory} category={category} profileSections={profileSections} /></div>}
        <form className={all ? "min-w-0 space-y-4 xl:col-start-1 xl:row-start-1" : "mt-6 space-y-7"} onSubmit={submit}
          onChange={() => { if (success) setSuccess(false); }} aria-busy={busy || uploading} noValidate>
          {all ? profileSections.map(([id, label]) => (
            <section key={id} id={id} className={profileCard}>
              <h2 className="mb-4 text-xl font-semibold tracking-tight">{label}</h2>
              {sectionFields[id]}
            </section>
          )) : [personalFields, locationFields, publicFields, interestFields][step]}

          <div className={all ? "sticky bottom-0 space-y-3 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 shadow-sm sm:p-4" : "space-y-4"}>
            {error && <p role="alert" className={errorBox}>{errors[error]}</p>}
            {success && <p role="status" className="text-[var(--theme-link)]">{t.saved}</p>}
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={busy || uploading} className={action}>{busy ? t.working : all ? t.saveProfile : step === 3 ? m.finish : m.continue}</button>
              {onboarding && (step === 1 || step === 3) && <button type="button" disabled={busy || uploading} className="font-semibold underline" onClick={() => { void submit(undefined, true); }}>{m.skip}</button>}
              {onboarding && step > 0 && <button type="button" disabled={busy || uploading} className="font-semibold underline" onClick={() => { setError(""); setStep(step - 1); }}>{m.back}</button>}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
