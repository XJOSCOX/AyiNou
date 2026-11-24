"use client";

import type { FeedPost, Institution } from "@ayinou/shared";
import Image from "next/image";
import { useCallback, useState } from "react";
import { publicRequest } from "@/lib/api";
import { useInstitutionResource } from "./institution-ui";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";

export function FeedAvatar({ name, url, compact = false, organization = false }: {
  name: string; url?: string | null; compact?: boolean; organization?: boolean;
}) {
  const [locale] = useLocale();
  const [failed, setFailed] = useState<string | null>(null);
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase(locale);

  return <span aria-hidden="true" className={`grid shrink-0 place-items-center overflow-hidden font-semibold text-[var(--theme-link)] ${compact ? "size-7 text-xs" : "size-10 text-sm"} ${organization ? "rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)]" : "rounded-full bg-[var(--theme-selected)]"}`}>
    {url && url !== failed ? <Image src={url} alt="" width={40} height={40} unoptimized
      className={organization ? "size-full object-contain" : "size-full object-cover"} onError={() => setFailed(url)} /> : initial}
  </span>;
}

function CurrentMemberAvatar({ fallback }: { fallback: string }) {
  const { memberId, displayName, avatarUrl } = useMemberIdentity();
  return memberId ? <FeedAvatar name={displayName || fallback} url={avatarUrl} /> : null;
}

const pendingLogos = new Map<string, Promise<string | null>>();

function loadOrganizationLogo(handle: string) {
  const pending = pendingLogos.get(handle);
  if (pending) return pending;
  const request = publicRequest("/api/v1/institutions/by-handle/" + encodeURIComponent(handle), {
    signal: AbortSignal.timeout(5000),
  }).then(({ organization }: { organization: Institution }) => organization.logoUrl)
    .catch(() => null).finally(() => pendingLogos.delete(handle));
  pendingLogos.set(handle, request);
  return request;
}

export function OrganizationAvatar({ handle, name }: { handle: string; name: string }) {
  const load = useCallback(() => loadOrganizationLogo(handle), [handle]);
  const logo = useInstitutionResource(load);
  return <FeedAvatar name={name} url={logo.data} organization />;
}

export function PostAuthorAvatar({ post, name, guest = false }: {
  post: Pick<FeedPost, "author" | "own" | "social">; name: string; guest?: boolean;
}) {
  if (post.social?.organization) return <OrganizationAvatar key={post.social.organization.handle} name={name} handle={post.social.organization.handle} />;
  if (post.author) return <FeedAvatar name={name} url={post.author.avatarUrl} />;
  return post.own && !guest ? <CurrentMemberAvatar fallback={name} /> : null;
}
