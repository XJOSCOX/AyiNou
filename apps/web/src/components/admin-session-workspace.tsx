"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AdminWorkspace } from "./admin-workspace";
import { institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { browserSupabase } from "@/lib/supabase/browser";

export function AdminSessionWorkspace({ subject, expiresAt }: { subject: string; expiresAt: string }) {
  const [locale] = useLocale();
  const [closed, setClosed] = useState(false);
  const t = sessionSecurityMessages[locale];
  useEffect(() => {
    const time = setTimeout(() => setClosed(true), Math.max(0, Date.parse(expiresAt) - Date.now()));
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id !== subject) setClosed(true);
    });
    return () => { clearTimeout(time); subscription.unsubscribe(); };
  }, [expiresAt, subject]);

  return closed ? <MemberShell>
    <p role="status">{t.expiredLink} <Link href="/admin" className={institutionLink}>{t.openAdmin}</Link></p>
  </MemberShell> : <AdminWorkspace />;
}
