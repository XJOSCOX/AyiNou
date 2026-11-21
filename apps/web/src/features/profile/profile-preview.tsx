import Image from "next/image";
import type { MemberProfile, MembershipCategory } from "@ayinou/shared";
import { AdministratorMark, FounderMark, PersonalClaimChecks } from "@/components/institution-ui";
import { FounderVerifiedMark } from "@/components/founder-verified-badge";
import { authMessages } from "@/lib/auth-i18n";
import type { Locale } from "@/lib/i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import type { useMemberIdentity } from "@/lib/member-display-name";

type ProfilePreviewProps = {
  locale: Locale;
  saved: Pick<MemberProfile, "displayName" | "username" | "biography" | "showMembershipCategory" |
    "membershipCategory" | "discoverable" | "isVisible">;
  avatar: MemberProfile["avatarUrl"];
} & Pick<ReturnType<typeof useMemberIdentity>, "administrator" | "founder" | "founderVerified" | "claims">;

export function SavedProfilePreview({ locale, saved, avatar, claims, administrator, founder, founderVerified }: ProfilePreviewProps) {
  const m = membershipMessages[locale];
  return (
    <section className="mt-7 rounded-2xl bg-[var(--theme-control)] p-5" aria-label={m.preview}>
      <h2 className="font-bold">{m.preview}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{m.previewNote}</p>
      <div className="mt-4 flex items-center gap-4">
        {avatar && <Image src={avatar} alt={m.photoAlt} width={56} height={56} className="rounded-full" unoptimized />}
        <div>
          <p className="font-bold">{saved.displayName}{saved.displayName && <>{" "}<PersonalClaimChecks claims={claims} /></>}
            {founder ? <FounderMark /> : administrator && <AdministratorMark />}
            {founderVerified && !claims.includes("identity") && <FounderVerifiedMark />}</p>
          {saved.username && <p className="text-sm text-[var(--theme-body)]">@{saved.username}</p>}
        </div>
      </div>
      {saved.biography && <p className="mt-3 whitespace-pre-line break-words text-sm">{saved.biography}</p>}
      {saved.showMembershipCategory && saved.membershipCategory && <p className="mt-2 text-sm text-[var(--theme-link)]">
        {saved.membershipCategory === "haitian" ? m.haitianCount : m.supporterCount}
      </p>}
    </section>
  );
}

export function DraftProfilePreview({
  locale, saved, avatar, claims, administrator, founder, founderVerified, displayName, username, biography, showCategory, category, profileSections,
}: ProfilePreviewProps & {
  displayName: string;
  username: string;
  biography: string;
  showCategory: boolean;
  category: MembershipCategory | "";
  profileSections: readonly (readonly [string, string])[];
}) {
  const m = membershipMessages[locale];
  const t = authMessages[locale];
  const display = displayName.trim();
  const initials = display.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase(locale);
  const visible = saved.isVisible && saved.discoverable && saved.username;
  return (
    <aside>
      <section aria-label={m.preview} className="overflow-hidden rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className="h-16 bg-[var(--theme-hero)] sm:h-20" aria-hidden="true" />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-9 grid size-[4.5rem] place-items-center overflow-hidden rounded-full border-4 border-[var(--theme-surface)] bg-[var(--theme-selected)] text-lg font-semibold text-[var(--theme-link)]">
            {avatar ? <Image src={avatar} alt="" width={72} height={72} className="size-full object-cover" unoptimized />
              : <span aria-hidden="true">{initials || "·"}</span>}
          </div>
          <h2 className="mt-3 text-sm font-semibold text-[var(--theme-link)]">{m.preview}</h2>
          <p className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight">
            {display || t.displayName}{display && display === saved.displayName && <>{" "}<PersonalClaimChecks claims={claims} />
              {founder ? <FounderMark /> : administrator && <AdministratorMark />}
              {founderVerified && !claims.includes("identity") && <FounderVerifiedMark />}</>}
          </p>
          {username.trim() && <p className="mt-1 break-all text-sm text-[var(--theme-body)]">@{username.trim().toLowerCase()}</p>}
          {biography.trim() && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[var(--theme-body)]">{biography.trim()}</p>}
          {showCategory && category && <p className="mt-3 text-sm text-[var(--theme-link)]">{category === "haitian" ? m.haitianCount : m.supporterCount}</p>}
          <p className="mt-4 border-t border-[var(--theme-border)] pt-3 text-sm text-[var(--theme-body)]">{visible ? m.profilePublished : m.profileHidden}</p>
        </div>
      </section>
      <nav aria-label={t.profileTitle} className="mt-4 flex flex-wrap gap-2 xl:flex-col">
        {profileSections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)]">{label}</a>)}
      </nav>
    </aside>
  );
}
