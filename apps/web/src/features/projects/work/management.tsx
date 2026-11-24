import { type WorkProps, useWorkMessages, Operation, field } from "./work-controls";
import { institutionField } from "@/components/institution-ui";
import { ProjectSection } from "@/components/project-ui";
import { ProjectIdentityNotice } from "@/components/project-form";

const statusOptions = {
  approved: ["active"], active: ["paused", "completed"], paused: ["active", "completed", "archived"], completed: ["archived"], archived: [],
} as const;

export function Management(props: WorkProps) {
  const { work } = props;
  const { t } = useWorkMessages();
  const options = statusOptions[work.status];
  const ownerScope = work.role === "owner" || work.role === "delegate";
  return <ProjectSection title={t.management}>
    {ownerScope && work.status === "approved" && <p className="max-w-[65ch] text-sm text-[var(--theme-body)]">{t.workStartHelp}</p>}
    {ownerScope && work.identity !== "verified" && <ProjectIdentityNotice state={work.identity} />}
    {ownerScope && options.length > 0 && <div className="max-w-xl rounded-lg border border-[var(--theme-border)] p-4">
      <Operation {...props} action="execution_status" input={{ version: work.version }}
        label={work.status === "approved" ? t.startProject : undefined}
        fields={(data) => ({ status: field(data, "status") })}>
        <label className="text-sm font-semibold">{t.nextStatus}<select className={institutionField} name="status">{options.map((status) =>
          <option key={status} value={status}>{t.states[status]}</option>)}</select></label>
      </Operation>
    </div>}
    {(!ownerScope || options.length === 0) && <p className="text-sm text-[var(--theme-body)]">{t.states[work.status]}</p>}
  </ProjectSection>;
}
