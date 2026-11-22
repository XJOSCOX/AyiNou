"use client";

import { useState } from "react";
import { authorizedRequest } from "@/lib/api";
import { useLocale } from "@/lib/locale-store";
import { privilegedSetupMessages } from "@/lib/privileged-setup-i18n";
import { institutionAction } from "./institution-ui";

export function AdministratorInvitation({ actor, proposal, issued, onRevoked }: {
  actor: string; proposal: string; issued?: boolean; onRevoked: () => void;
}) {
  const [locale] = useLocale();
  const t = privilegedSetupMessages[locale];
  const [delivery, setDelivery] = useState<{ flowId: string; code: string }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closed, setClosed] = useState(false);

  async function change(revoke: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      if (revoke) {
        await authorizedRequest("/api/v1/admin/appointments/" + proposal + "/invitation", { method: "DELETE" }, actor);
        setDelivery(undefined);
        setClosed(true);
        onRevoked();
      } else {
        setDelivery(await authorizedRequest("/api/v1/admin/appointments/" + proposal + "/invitation", { method: "POST" }, actor));
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <div className="grid min-w-0 gap-2">
    {failed && <p role="alert">{t.failed}</p>}
    {delivery && <div role="status" className="grid gap-2 break-all">
      <p>{t.deliver}</p>
      <code>{window.location.origin}/activate/a/{delivery.flowId}</code>
      <code>{delivery.code}</code>
    </div>}
    {!closed && <div className="flex flex-wrap gap-2">
      {!delivery && !issued && <button onClick={() => void change(false)} disabled={busy} type="button" className={institutionAction}>{t.issue}</button>}
      <button onClick={() => void change(true)} disabled={busy} type="button" className={institutionAction}>{t.revoke}</button>
    </div>}
  </div>;
}
