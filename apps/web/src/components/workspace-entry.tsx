"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PrivateFlow } from "@ayinou/shared";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { adminEntryPath, type AdminTab } from "@/lib/admin-navigation";
import { adminMessages } from "@/lib/admin-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { ApiRequestError, apiErrorCode } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { openPrivateFlow, privateFlowPath } from "@/lib/session-security";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { AdminSectionContext } from "./admin-section-context";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { MfaChallenge } from "./mfa-challenge";
import { PageHeader } from "./page-header";

export function WorkspaceEntry({ subject, sessionId, kind, totp, factorIds, verify, section }: {
  subject: string; sessionId: string; kind: Extract<PrivateFlow["kind"], "admin_workspace" | "verification_workspace" | "moderation_workspace">;
  totp: boolean; factorIds: string[]; verify: boolean; section: AdminTab;
}) {
  const [locale] = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(verify && totp);
  const [error, setError] = useState<unknown>(verify && !totp ? new ApiRequestError("MFA_REQUIRED", 403) : null);
  const restoreFocus = useRef(false);
  const t = sessionSecurityMessages[locale];
  const delegated = kind === "moderation_workspace";
  const admin = kind !== "verification_workspace";
  const triage = delegated && section === "communityNeeds";
  const entry = triage ? "/communities/intake/triage" : admin ? adminEntryPath(section) : "/verification/review";

  async function open(afterVerification = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const flow = await openPrivateFlow(kind, subject, sessionId);
      const path = privateFlowPath(flow, section);
      if (afterVerification) router.replace(path);
      else router.push(path);
    } catch (cause) {
      const code = apiErrorCode(cause);
      if (!afterVerification && totp && code === "MFA_REQUIRED") {
        setVerifying(true);
      } else {
        setVerifying(false);
        if (code === "SESSION_CHANGED") setError(new ApiRequestError("UNAUTHORIZED", 401));
        else if (cause instanceof ApiRequestError && cause.status === 404) setError(new ApiRequestError("FORBIDDEN", 403));
        else setError(cause);
      }
      setBusy(false);
    }
  }

  function cancelVerification() {
    restoreFocus.current = true;
    setVerifying(false);
    if (verify) window.history.replaceState(null, "", entry);
  }

  function endVerificationSession() {
    setVerifying(false);
    setError(new ApiRequestError("UNAUTHORIZED", 401));
  }

  return <MemberShell>
    <div className="grid gap-4">
      <PageHeader title={triage ? needReviewLabel(locale,"triageQueue") : delegated ? featureMessages[locale].features : admin ? adminMessages[locale].administration : institutionMessages[locale].review} />
      {verifying ? <div className={`${institutionCard} mx-auto w-full max-w-md py-6 sm:py-8`}>
        <MfaChallenge factorIds={factorIds} subject={subject} sessionId={sessionId}
          workspace={{ onVerified: () => open(true), onCancel: cancelVerification, onSessionEnded: endVerificationSession }} />
      </div> : <section className={`${institutionCard} space-y-3`} aria-busy={busy}>
        <p>{t.adminLinkHelp}</p>
        {error !== null && <AdminSectionContext.Provider value={section}>
          <AdminFeedback error={error} totp={totp} next={admin ? "/admin" : "/verification/review"} />
        </AdminSectionContext.Provider>}
        <button type="button" className={institutionAction} disabled={busy} onClick={() => void open()}
          ref={(button) => {
            if (button && restoreFocus.current) {
              restoreFocus.current = false;
              button.focus();
            }
          }}>{triage ? needReviewLabel(locale,"access") : delegated ? featureMessages[locale].moderationEntry : admin ? t.openAdmin : t.openReview}</button>
      </section>}
    </div>
  </MemberShell>;
}
