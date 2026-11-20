"use client";

import { useEffect, useState } from "react";
import { fetchApiStatus } from "@/lib/api";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { SiteBrand } from "./site-brand";

type Connection = "checking" | "online" | "offline";
type ResolvedConnection = Exclude<Connection, "checking">;
let lastCheck: { result: ResolvedConnection; expires: number } | undefined;
let pendingCheck: Promise<ResolvedConnection> | undefined;

function checkConnection() {
  if (lastCheck && Date.now() < lastCheck.expires) return Promise.resolve(lastCheck.result);
  pendingCheck ??= fetchApiStatus(AbortSignal.timeout(5000))
    .then(() => "online" as const, () => "offline" as const)
    .then((result) => {
      lastCheck = { result, expires: Date.now() + (result === "online" ? 30_000 : 5000) };
      return result;
    })
    .finally(() => { pendingCheck = undefined; });
  return pendingCheck;
}

export function SiteFooter({ member = false }: { member?: boolean }) {
  const [locale] = useLocale();
  const t = messages[locale];
  const [connection, setConnection] = useState<Connection>("checking");

  useEffect(() => {
    let cancelled = false;
    void checkConnection().then((result) => { if (!cancelled) setConnection(result); });
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="border-t border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className={`flex w-full flex-wrap items-center gap-x-6 gap-y-3 py-4 text-sm ${member ? "px-4 sm:px-6 xl:px-10" : "mx-auto max-w-[1500px] px-4 sm:px-8"}`}>
        <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-4 gap-y-2">
          <SiteBrand href="#top" />
          <p className="text-[var(--theme-body)]">{t.footer}</p>
        </div>
        <div className="text-[var(--theme-body)]" aria-live="polite">
          <p>{t.statusLabel} · {t[connection]}</p>
          {connection === "offline" && <p className="mt-1">{t.offlineHelp}</p>}
        </div>
      </div>
    </footer>
  );
}
