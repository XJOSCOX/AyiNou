"use client";

import { useState } from "react";
import { projectReportCategories, type ProjectReportCategory } from "@ayinou/shared";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { projectMessages } from "@/lib/project-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionField } from "./institution-ui";
import { ProjectDisclosure } from "./project-ui";

export function ProjectReportForm({ title, submitReport }: {
  title?: string; submitReport: (category: ProjectReportCategory, explanation: string) => Promise<unknown>;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState(false);
  return <ProjectDisclosure title={title ?? t.report}>
    {saved ? <p role="status" className="text-sm">{t.reported}</p> : <form className="grid min-w-0 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const category = projectReportCategories.find((value) => value === fields.get("category"));
      if (category) void mutation.run(async () => {
        await submitReport(category, String(fields.get("explanation") ?? "").trim());
        setSaved(true);
      });
    }}>
      <label className="text-sm font-semibold">{t.reportCategory}
        <select className={institutionField} name="category">
          {projectReportCategories.map((value) => <option key={value} value={value}>{t.reports[value]}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">{t.reason}<textarea name="explanation" className={institutionField} rows={3} minLength={10} maxLength={500} required /></label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.report}</button>
    </form>}
  </ProjectDisclosure>;
}
