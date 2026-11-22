"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { FounderAppealItem } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";

const endpoint = "/api/v1/verification/founder-appeals";

export function FounderAppealReview({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const { memberId } = useMemberIdentity();
  const load = useCallback((signal: AbortSignal): Promise<FounderAppealItem[]> =>
    authorizedRequest(endpoint, { signal, headers: { "X-Ayinou-Workspace": workspaceId } }, memberId ?? undefined), [memberId, workspaceId]);
  const resource = useInstitutionResource(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retry = useRef<{ item: string; action: string; requestId: string } | null>(null);

  async function decide(event: FormEvent<HTMLFormElement>, item: string) {
    event.preventDefault();
    if (busy || !memberId) return;
    const data = new FormData(event.currentTarget);
    const action = data.get("action");
    if ((action !== "uphold" && action !== "revoke") || data.get("noConflict") !== "on") return;
    if (retry.current?.item !== item || retry.current.action !== action) retry.current = { item, action, requestId: crypto.randomUUID() };
    setError(null);
    setBusy(true);
    try {
      await authorizedRequest(endpoint + "/" + item, {
        method: "POST", headers: { "X-Ayinou-Workspace": workspaceId },
        body: JSON.stringify({ action, requestId: retry.current.requestId, noConflict: true }),
      }, memberId);
      retry.current = null;
      resource.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!memberId || (!resource.data?.length && !resource.error && !error)) return null;
  const fault = error ?? resource.error;
  return <section className={institutionCard} aria-label={t.appeal.queue}>
    <h2 className="text-xl font-semibold">{t.appeal.queue}</h2>
    {fault != null && <ApiErrorNotice error={fault} retry={resource.refresh} />}
    {resource.data?.map((item) => <form key={item.id} className="mt-4 grid max-w-md gap-3"
      onSubmit={(event) => { void decide(event, item.id); }}>
      <p className="break-words">{item.username ? "@" + item.username + " · " : ""}{t.states[item.status]}</p>
      <label>{t.reviewAction}
        <select name="action" className={institutionField} required defaultValue="">
          <option value="" disabled>{t.choose}</option>
          <option value="uphold">{t.appeal.uphold}</option>
          {["held", "granted", "revoked"].includes(item.status) && <option value="revoke">{t.actions.revoke}</option>}
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm"><input name="noConflict" type="checkbox" required />{t.noConflict}</label>
      <button type="submit" className={institutionAction} disabled={busy}>{t.confirm}</button>
    </form>)}
  </section>;
}
