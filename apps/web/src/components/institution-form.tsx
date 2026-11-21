"use client";

import { useEffect, useState, type FormEvent } from "react";
import { organizationKinds, type Department, type InstitutionInput, type OrganizationRole } from "@ayinou/shared";
import { fetchDepartments } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionErrorBox, institutionField } from "./institution-ui";

export function InstitutionForm({ initial, role = "owner", identityLocked = false, onSave }: {
  initial?: InstitutionInput;
  role?: OrganizationRole;
  identityLocked?: boolean;
  onSave: (input: Partial<InstitutionInput>) => Promise<void>;
}) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const [country, setCountry] = useState(initial?.countryCode ?? "HT");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentError, setDepartmentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const identity = role === "owner" && !identityLocked;
  const contact = role === "owner" || role === "administrator";

  useEffect(() => {
    if (!identity) return;
    let active = true;
    fetchDepartments().then((result) => { if (active) setDepartments(result); })
      .catch(() => { if (active) setDepartmentError(true); });
    return () => { active = false; };
  }, [identity]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? "").trim();
    const input: Partial<InstitutionInput> = { description: text("description") || null };
    const departmentCode = departmentError ? initial?.departmentCode ?? null : text("department") || null;
    if (identity) Object.assign(input, {
      name: text("name"), handle: text("handle"), kind: text("kind"), countryCode: country,
      departmentCode: country === "HT" ? departmentCode : null,
      website: text("website") || null,
    });
    if (contact) input.contactEmail = text("contact") || null;
    // Omit unchanged fields so a pending verification does not block unrelated edits.
    if (initial) {
      for (const key of Object.keys(input) as (keyof InstitutionInput)[]) {
        if (input[key] === initial[key]) delete input[key];
      }
      if (!Object.keys(input).length) return;
    }
    setBusy(true);
    setFailed(null);
    setSaved(false);
    try { await onSave(input); setSaved(true); }
    catch (cause) { setFailed(cause); }
    finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" onSubmit={save} aria-busy={busy} onChange={() => { if (saved) setSaved(false); }}>
      {(identity || identityLocked) && <fieldset disabled={!identity || busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.name}<input name="name" className={institutionField} defaultValue={initial?.name} required minLength={2} maxLength={120} /></label>
        <div className="min-w-0 text-sm font-semibold">
          <label htmlFor="institution-handle">{t.handle}</label>
          <input id="institution-handle" name="handle" className={institutionField} defaultValue={initial?.handle}
            required pattern="[a-z0-9][a-z0-9\-]{2,39}" maxLength={40} autoCapitalize="none" spellCheck={false} aria-describedby="institution-handle-hint" />
          <small id="institution-handle-hint" className="mt-1 block text-[var(--theme-body)]">{t.handleHint}</small>
        </div>
        <label className="min-w-0 text-sm font-semibold">{t.kind}<select name="kind" className={institutionField} defaultValue={initial?.kind ?? organizationKinds[0]}>
          {organizationKinds.map((kind) => <option key={kind} value={kind}>{t[kind]}</option>)}
        </select></label>
        <label className="min-w-0 text-sm font-semibold">{t.country}<input name="country" className={institutionField} value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())} required pattern="[A-Z]{2}" maxLength={2} /></label>
        {country === "HT" && <label className="min-w-0 text-sm font-semibold">{t.department}<select key={departments.length} name="department" className={institutionField} defaultValue={initial?.departmentCode ?? ""} disabled={departmentError}>
          <option value="">{auth.departmentPlaceholder}</option>
          {initial?.departmentCode && !departments.some((item) => item.code === initial.departmentCode)
            && <option value={initial.departmentCode}>{initial.departmentCode}</option>}
          {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select></label>}
        <div className="min-w-0 text-sm font-semibold">
          <label htmlFor="institution-website">{t.website}</label>
          <input id="institution-website" type="url" name="website" className={institutionField}
            defaultValue={initial?.website ?? ""} maxLength={300} aria-describedby="institution-website-hint" />
          <small id="institution-website-hint" className="mt-1 block text-[var(--theme-body)]">{t.linkHint}</small>
        </div>
      </fieldset>}
      {identityLocked && <p className="text-sm text-[var(--theme-body)]">{t.identityLocked}</p>}
      <label className="block text-sm font-semibold">{t.description}<textarea name="description" className={institutionField} rows={4} defaultValue={initial?.description ?? ""} maxLength={600} disabled={busy} /></label>
      {contact && <div className="text-sm font-semibold">
        <label htmlFor="institution-contact">{t.contactEmail}</label>
        <input id="institution-contact" type="email" name="contact" className={institutionField}
          defaultValue={initial?.contactEmail ?? ""} maxLength={254} disabled={busy} aria-describedby="institution-contact-hint" />
        <small id="institution-contact-hint" className="mt-1 block text-[var(--theme-body)]">{t.contactHint}</small>
      </div>}
      {failed !== null && <p role="alert" className={institutionErrorBox}>{institutionError(t, failed)}</p>}
      {saved && <p role="status" className="text-sm text-[var(--theme-link)]">{t.saved}</p>}
      <button type="submit" disabled={busy} className={institutionAction}>{busy ? auth.working : t.save}</button>
    </form>
  );
}
