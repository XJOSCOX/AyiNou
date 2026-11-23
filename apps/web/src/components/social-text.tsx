"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DiscoveryCard } from "@ayinou/shared";
import { searchDiscovery } from "@/lib/discovery-api";
import { useLocale } from "@/lib/locale-store";
import { socialMessages } from "@/lib/social-i18n";
import { institutionLink } from "./institution-ui";

const tokenPattern = /(^|[^\p{L}\p{N}_@#.])(@(?:org:)?[a-zA-Z][a-zA-Z0-9_-]{2,39}(?![\p{L}\p{N}_-])|#[\p{L}\p{M}\p{N}_]{1,72}(?![\p{L}\p{M}\p{N}_]))/gu;

export function SocialText({ body, mentions, hashtags }: { body: string; mentions?: Record<string, string>; hashtags?: string[] }) {
  const chunks = [];
  let end = 0;
  for (const match of body.matchAll(tokenPattern)) {
    const start = match.index + match[1].length;
    const token = match[2];
    const value = token.slice(1).normalize("NFC").toLowerCase();
    const href = token.startsWith("@") ? mentions?.[value]
      : hashtags?.includes(value) ? "/feed/hashtag/" + encodeURIComponent(value) : undefined;
    chunks.push(body.slice(end, start), href ? <Link className={institutionLink} key={start} href={href}>{token}</Link> : token);
    end = start + token.length;
  }
  chunks.push(body.slice(end));
  return <>{chunks}</>;
}

export function MentionSuggestions({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [locale] = useLocale();
  const token = /(?:^|[^\p{L}\p{N}_@.])@((?:org:)?[a-zA-Z][a-zA-Z0-9_-]{1,38})$/u.exec(value)?.[1]?.toLowerCase();
  const [result, setResult] = useState<{ token: string; accounts: DiscoveryCard[] } | null>(null);
  useEffect(() => {
    if (!token || token === "org") return;
    const query = token.replace(/^org:/, "");
    if (query.length < 2) return;
    const request = new AbortController();
    const timeout = setTimeout(() => {
      const kinds = token.startsWith("org:") ? (["institutions"] as const) : (["people", "institutions"] as const);
      void Promise.all(kinds.map((kind) => searchDiscovery({ kind, q: query }, null, request.signal))).then((pages) => {
        if (!request.signal.aborted) setResult({ token, accounts: pages.flatMap(({ accounts }) => accounts.slice(0, 4)) });
      }).catch(() => { if (!request.signal.aborted) setResult({ token, accounts: [] }); });
    }, 280);
    return () => { clearTimeout(timeout); request.abort(); };
  }, [token]);

  if (!token || result?.token !== token || !result.accounts.length) return null;
  return <ul aria-label={socialMessages[locale].mentionSuggestions} className="grid gap-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-2">
    {result.accounts.map((account) => <li key={account.id}>
      <button type="button" className={`${institutionLink} min-h-9 px-2 text-start`} onClick={() => {
        setResult(null);
        onChange(value.slice(0, -token.length) + (account.kind === "institution" ? "org:" : "") + account.handle + " ");
      }}>{account.name} · @{account.handle}</button>
    </li>)}
  </ul>;
}
