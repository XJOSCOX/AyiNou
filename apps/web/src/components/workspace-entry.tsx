"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformAccess, PrivateFlow } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { ApiRequestError } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { openPrivateFlow, privateFlowPath } from "@/lib/session-security";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

export function WorkspaceEntry({ subject, access, kind }: {
  subject: string; access: PlatformAccess; kind: Extract<PrivateFlow["kind"], "admin_workspace" | "verification_workspace">;
}) {
  const [locale] = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const t = sessionSecurityMessages[locale];
  const admin = kind === "admin_workspace";

  async function open() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const flow = await openPrivateFlow(kind, subject);
      router.push(privateFlowPath(flow));
    } catch (cause) {
      setError(cause instanceof ApiRequestError && cause.status === 404 ? new ApiRequestError("FORBIDDEN", 403) : cause);
      setBusy(false);
    }
  }

  return <MemberShell>
    <div className="grid gap-4">
      <PageHeader title={admin ? adminMessages[locale].administration : institutionMessages[locale].review} />
      <section className={`${institutionCard} space-y-3`} aria-busy={busy}>
        <p>{t.adminLinkHelp}</p>
        {error !== null && <AdminFeedback error={error} totp={access.totp} next={admin ? "/admin" : "/verification/review"} />}
        <button type="button" className={institutionAction} disabled={busy} onClick={() => void open()}>{admin ? t.openAdmin : t.openReview}</button>
      </section>
    </div>
  </MemberShell>;
}
