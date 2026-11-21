"use client";

import { useLocale } from "@/lib/locale-store";
import { passwordRules } from "@/lib/password-policy";
import { passwordSecurityMessages } from "@/lib/password-security-i18n";
import styles from "./password-requirements.module.css";

export function PasswordRequirements({ password }: { password: string }) {
  const [locale] = useLocale();
  const t = passwordSecurityMessages[locale];
  const checks = passwordRules.map(({ key, test }) => ({ key, met: test(password) }));
  const met = checks.filter((check) => check.met).length;
  return <div className="mt-3 grid gap-2 text-xs text-[var(--theme-body)]" id="password-hint">
    <p className="font-semibold">{t.requirements}</p>
    <progress className={styles.progress} aria-label={t.progress} max={checks.length} value={met} />
    <ul className="grid gap-1 sm:grid-cols-2">
      {checks.map((check) => <li className="flex items-center gap-1.5" key={check.key}>
        <span className={check.met ? styles.met : undefined} aria-hidden="true">{check.met ? "✓" : "○"}</span>
        {t[check.key]}
      </li>)}
    </ul>
  </div>;
}
