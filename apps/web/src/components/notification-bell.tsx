"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { loadUnreadCount, notificationRead } from "@/lib/notification-api";

export function NotificationBell() {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  const opened = pathname === "/notifications";
  useEffect(() => {
    let controller: AbortController | undefined;
    function refresh() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      loadUnreadCount(current.signal).then((result) => {
        if (!current.signal.aborted) setCount(result.count);
      }).catch(() => { if (!current.signal.aborted) setCount(0); });
    }
    refresh();
    window.addEventListener(notificationRead, refresh);
    return () => { controller?.abort(); window.removeEventListener(notificationRead, refresh); };
  }, [opened]);
  const label = count ? t.unread.replace("{n}", new Intl.NumberFormat(locale).format(count)) : t.notifications;
  return <Link href="/notifications" title={label} aria-label={label} aria-current={opened ? "page" : undefined}
    className="relative grid size-9 shrink-0 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)]">
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8m-8 11a2 2 0 0 0 4 0" />
    </svg>
    {count > 0 && <span aria-hidden="true" className="absolute -end-1 -top-1 min-w-4 rounded-full bg-[var(--theme-selected)] px-0.5 text-center text-[10px] font-bold">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
