"use client";

import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminMemberLookup } from "./admin-member-lookup";

export function FounderConsentLookup({ value, onChange, workspaceId, disabled }: {
  value: string; onChange: (value: string) => void; workspaceId?: string; disabled: boolean;
}) {
  const [locale] = useLocale();
  return <AdminMemberLookup label={founderMessages[locale].username} value={value} onChange={onChange} requireUsername
    workspaceId={workspaceId} disabled={disabled} onSelect={(member) => { if (member.username) onChange(member.username); }} />;
}
