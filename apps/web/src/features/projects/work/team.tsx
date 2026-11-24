import { type WorkProps, useWorkMessages, Operation, field, actionsClass } from "./work-controls";
import { institutionField } from "@/components/institution-ui";
import { projectTeamRoles } from "@ayinou/shared";
import { ProjectDisclosure, ProjectSection } from "@/components/project-ui";

export function Team(props: WorkProps) {
  const { work } = props;
  const { t, locale } = useWorkMessages();
  const ownerScope = work.role === "owner" || work.role === "delegate";
  const canManage = ownerScope || work.role === "manager";
  const active = work.status === "active";
  const canRevoke = active || work.status === "paused";
  const roles = ownerScope ? projectTeamRoles : ["contributor", "volunteer"] as const;
  return <ProjectSection title={t.team}>
    {canManage && active && <ProjectDisclosure title={t.events.invite}>
      <Operation {...props} action="invite" fields={(data) => ({ handle: field(data, "handle").toLowerCase(), role: field(data, "role") })}>
        <label>{t.username}<input className={institutionField} name="handle" required maxLength={24} autoCapitalize="none" /></label>
        <label>{t.role}<select className={institutionField} name="role">{roles.map((role) => <option key={role} value={role}>{t.roles[role]}</option>)}</select></label>
      </Operation>
    </ProjectDisclosure>}
    {!work.invites.length && !work.team.length && <p className="mt-2">{t.empty}</p>}
    <ul className="mt-3 grid gap-3">{work.invites.map((item) => <li className="border-t border-[var(--theme-border)] pt-3" key={item.id}>
      <p>{t.roles[item.role]}{item.recipient?.name && <> · {item.recipient.name}</>} · {new Date(item.expiresAt).toLocaleDateString(locale)}</p>
      <div className={actionsClass}>
        {item.mine && active && <Operation {...props} action="invite_accept" input={{ id: item.id }} />}
        {item.mine && canRevoke && <Operation {...props} action="invite_decline" input={{ id: item.id }} />}
        {!item.mine && canManage && canRevoke && <Operation {...props} action="invite_revoke" input={{ id: item.id }} />}
      </div>
    </li>)}</ul>
    <ul className="mt-3 grid gap-3">{work.team.map((item) => item.person && <li className="border-t border-[var(--theme-border)] pt-3" key={item.person.id}>
      <p className="break-words">{item.person.name || item.person.handle || t.member} · {t.roles[item.role]}{!item.eligible && <> · {t.inactiveMember}</>}</p>
      {!item.mine && canRevoke && canManage && (ownerScope || item.role === "contributor" || item.role === "volunteer") &&
        <Operation {...props} action="member_revoke" input={{ userId: item.person.id }} />}
    </li>)}</ul>
  </ProjectSection>;
}
