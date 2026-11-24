import Image from "next/image";
import Link from "next/link";
import type { MemberProfile, MembershipCategory } from "@ayinou/shared";
import { AdministratorMark, FounderMark, PersonalClaimChecks } from "@/components/institution-ui";
import { FounderVerifiedMark } from "@/components/founder-verified-badge";
import { authMessages } from "@/lib/auth-i18n";
import type { Locale } from "@/lib/i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { action, errorBox } from "./profile-styles";
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
            {founderVerified && <FounderVerifiedMark />}</p>
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
  locale, saved, avatar, claims, administrator, founder, founderVerified, displayName, username, biography, showCategory, category, publish, publishDisabled, publishError,
}: ProfilePreviewProps & {
  displayName: string;
  username: string;
  biography: string;
  showCategory: boolean;
  category: MembershipCategory | "";
  publish?: () => void;
  publishDisabled: boolean;
  publishError: string;
}) {
  const m = membershipMessages[locale];
  const t = authMessages[locale];
  const display = displayName.trim();
  const initials = display.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase(locale);
  const visible = saved.isVisible && saved.discoverable && saved.username;
  return (
    <aside aria-labelledby="profile-preview-heading" className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="border-b border-[var(--theme-border)] px-4 py-3 sm:px-5">
        <h2 id="profile-preview-heading" className="text-sm font-semibold">{m.preview}</h2>
      </div>
      <div className="grid gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--theme-selected)] text-lg font-semibold text-[var(--theme-link)]">
            {avatar ? <Image src={avatar} alt="" width={72} height={72} className="size-full object-cover" unoptimized />
              : <span aria-hidden="true">{initials || "·"}</span>}
          </div>
          <div className="min-w-0">
            <p className="break-words text-xl font-semibold leading-snug tracking-tight" dir="auto">{display || t.displayName}</p>
            {username.trim() && <p className="break-all text-sm text-[var(--theme-body)]">@{username.trim().toLowerCase()}</p>}
          </div>
        </div>
        {display && display === saved.displayName && (claims.length > 0 || founder || administrator || founderVerified) &&
          <div className="flex flex-wrap items-center gap-1.5">
            <PersonalClaimChecks claims={claims} />
            {founder ? <FounderMark /> : administrator && <AdministratorMark />}
            {founderVerified && <FounderVerifiedMark />}
          </div>}
        {biography.trim() && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[var(--theme-body)]">{biography.trim()}</p>}
        {showCategory && category && <p className="text-sm text-[var(--theme-body)]">{category === "haitian" ? m.haitianCount : m.supporterCount}</p>}
      </div>
      <div className="grid gap-2 border-t border-[var(--theme-border)] px-4 py-3 text-sm text-[var(--theme-body)] sm:px-5">
        <p role="status">{visible ? m.profilePublished : m.profileHidden}</p>
        {visible && <Link href={`/members/${saved.username}`}
          className="w-fit font-semibold text-[var(--theme-link)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
          {institutionMessages[locale].publicProfile}
        </Link>}
        {!visible && publish && <div className="space-y-3">
          <p>{m.profilePublishHint}</p>
          <button type="button" className={action} disabled={publishDisabled} onClick={publish}>{m.profilePublish}</button>
          {publishError && <p role="alert" className={errorBox}>{publishError}</p>}
        </div>}
      </div>
    </aside>
  );
}
