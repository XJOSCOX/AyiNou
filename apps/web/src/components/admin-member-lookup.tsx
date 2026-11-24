"use client";

import { useEffect, useId, useState } from "react";
import type { AdminAccount } from "@ayinou/shared";
import { loadAdminAccounts } from "@/lib/admin-api";
import { authMessages } from "@/lib/auth-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminMemberBadges } from "./admin-account-avatar";
import { institutionField } from "./institution-ui";

type Match = Pick<AdminAccount, "id" | "username" | "displayName" | "personalClaims">;
type SearchResult = { query: string; matches: Match[]; failed: boolean };

export function AdminMemberLookup({ label, value, onChange, onSelect, workspaceId, disabled, requireUsername = false, selected = false }: {
  label: string; value: string; onChange: (value: string) => void; onSelect: (member: Match) => void;
  workspaceId?: string; disabled?: boolean; requireUsername?: boolean; selected?: boolean;
}) {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const id = useId();
  const [looking, setLooking] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<SearchResult>();
  const query = value.trim().replace(/^@/, "");
  const searching = looking && !selected && !disabled && !!workspaceId && query.length >= 2;
  const current = searching && result?.query === query ? result : undefined;
  const matches = current?.matches ?? [];
  const activeMatch = matches[active];
  const listId = id + "-suggestions";

  useEffect(() => {
    if (!searching || !workspaceId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadAdminAccounts(query, 0, workspaceId, controller.signal).then((accounts) => {
        if (controller.signal.aborted) return;
        const matches = accounts.filter(({ username, displayName }) => requireUsername ? !!username : !!(username || displayName)).slice(0, 6);
        setResult({ query, matches, failed: false });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ query, matches: [], failed: true });
      });
    }, 225);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, workspaceId, searching, requireUsername]);

  function choose(match: Match) {
    onSelect(match);
    setActive(-1);
    setLooking(false);
  }

  return <div className="min-w-0">
    <label htmlFor={id} className="text-sm font-semibold">{label}</label>
    <input id={id} className={institutionField} value={value}
      onChange={(event) => { onChange(event.target.value); setActive(-1); setLooking(true); }}
      onFocus={() => setLooking(true)} onBlur={() => { setLooking(false); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && looking) {
          event.preventDefault();
          setLooking(false);
          setActive(-1);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (!looking) setLooking(true);
          if (!matches.length) return;
          event.preventDefault();
          const last = matches.length - 1;
          setActive(event.key === "ArrowDown" ? (active >= last ? 0 : active + 1) : (active <= 0 ? last : active - 1));
        } else if (event.key === "Enter" && activeMatch) {
          event.preventDefault();
          choose(activeMatch);
        }
      }}
      role="combobox" aria-autocomplete="list" aria-expanded={matches.length > 0}
      aria-controls={listId} aria-activedescendant={activeMatch ? listId + "-" + active : undefined}
      autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={t.lookupPlaceholder}
      disabled={disabled} required={requireUsername} pattern={requireUsername ? "[A-Za-z0-9][A-Za-z0-9_]{2,23}" : undefined} maxLength={100} />
    {searching && <p role="status" className="mt-1 text-xs text-[var(--theme-body)]">
      {!current ? authMessages[locale].working : current.failed ? t.lookupUnavailable : !matches.length ? t.lookupEmpty : null}
    </p>}
    <ul id={listId} role="listbox" aria-label={label} hidden={!matches.length}
      className="mt-1 divide-y divide-[var(--theme-border)] rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      {matches.map((match, index) => <li key={match.id} id={listId + "-" + index} role="option" aria-selected={index === active}
        className="min-w-0 cursor-pointer px-3 py-2 text-sm hover:bg-[var(--theme-control)] aria-selected:bg-[var(--theme-selected)]"
        onPointerDown={(event) => { if (event.button === 0) event.preventDefault(); }} onClick={() => choose(match)}>
        <span className="flex min-w-0 flex-wrap items-center gap-1 font-semibold">
          <span className="min-w-0 break-words">{match.displayName || "@" + match.username}</span>
          <AdminMemberBadges username={match.username} claims={match.personalClaims} />
        </span>
        {match.displayName && match.username && <span className="block break-all text-xs text-[var(--theme-body)]">@{match.username}</span>}
      </li>)}
    </ul>
  </div>;
}
