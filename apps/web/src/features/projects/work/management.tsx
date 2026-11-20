import { type WorkProps, useWorkMessages, Operation, field } from "./work-controls";
import { institutionCard, institutionField } from "@/components/institution-ui";
import { ProjectIdentityNotice } from "@/components/project-form";

const statusOptions = {
  approved: ["active"], active: ["paused", "completed"], paused: ["active", "completed", "archived"], completed: ["archived"], archived: [],
} as const;

export function Management(props: WorkProps) {
  const { work } = props;
  const { t } = useWorkMessages();
  const options = statusOptions[work.status];
  const ownerScope = work.role === "owner" || work.role === "delegate";
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.management}</h2>
    <p className="mt-2">{t.states[work.status]}</p>
    {ownerScope && work.identity !== "verified" && <ProjectIdentityNotice state={work.identity} />}
    {ownerScope && options.length > 0 && <Operation {...props} action="execution_status" input={{ version: work.version }}
      fields={(data) => ({ status: field(data, "status") })}>
      <label>{t.nextStatus}<select className={institutionField} name="status">{options.map((status) =>
        <option key={status} value={status}>{t.states[status]}</option>)}</select></label>
    </Operation>}
  </section>;
}
