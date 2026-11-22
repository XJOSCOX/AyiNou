"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformAccess } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { ApiRequestError } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { openPrivateFlow, privateFlowPath } from "@/lib/session-security";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

export function AdminEntry({ subject, access }: { subject: string; access: PlatformAccess }) {
  const [locale] = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const t = sessionSecurityMessages[locale];

  async function open() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const flow = await openPrivateFlow("admin_workspace", subject);
      router.push(privateFlowPath(flow));
    } catch (cause) {
      setError(cause instanceof ApiRequestError && cause.status === 404 ? new ApiRequestError("FORBIDDEN", 403) : cause);
      setBusy(false);
    }
  }

  return <MemberShell>
    <div className="grid gap-4">
      <PageHeader title={adminMessages[locale].administration} />
      <section className={`${institutionCard} space-y-3`} aria-busy={busy}>
        <p>{t.adminLinkHelp}</p>
        {error !== null && <AdminFeedback error={error} totp={access.totp} />}
        <button type="button" className={institutionAction} disabled={busy} onClick={() => void open()}>{t.openAdmin}</button>
      </section>
    </div>
  </MemberShell>;
}
