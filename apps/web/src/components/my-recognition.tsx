"use client";

import type { RecognitionBadge } from "@ayinou/shared";
import { useState } from "react";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { institutionCard, useInstitutionResource } from "./institution-ui";
import { RecognitionMark } from "./recognition-mark";

type Award = { id: string; badge: RecognitionBadge; public: boolean; revokedAt: string | null };
async function load(signal: AbortSignal): Promise<Award[]> {
  const { data, error } = await browserSupabase().rpc("my_recognition_awards").abortSignal(signal);
  if (error) throw error;
  return data;
}

export function MyRecognition() {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const result = useInstitutionResource(load);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!result.data?.length) return null;

  async function change(id: string, display: boolean) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const { data, error } = await browserSupabase().rpc("set_recognition_visibility", { p_award: id, p_public: display });
      if (error || data !== true) throw error;
      result.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.copy.myBadges}</h2>
    {failed && <p role="alert">{authMessages[locale].retry}</p>}
    <ul className="mt-3 grid gap-3">
      {result.data.map((award) => <li key={award.id} className="flex flex-wrap items-center gap-3">
        <RecognitionMark badge={award.badge} />
        {award.revokedAt ? <span>{t.actions.revoke}</span> : <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={award.public} disabled={busy}
            onChange={(event) => void change(award.id, event.target.checked)} aria-label={`${t.copy.public} · ${award.badge.name[locale]}`} />
          {t.copy.public}
        </label>}
      </li>)}
    </ul>
  </section>;
}
