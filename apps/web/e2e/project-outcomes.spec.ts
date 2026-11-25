import { randomUUID } from "node:crypto";
import type { OutcomePage, OutcomeRequest, OutcomeSource } from "@ayinou/shared";
import { api, expect, finishPersonalOnboarding, sql, test, web, type Member } from "./fixtures";
import { outcomeMessages } from "../src/lib/project-outcome-i18n";

const copy = outcomeMessages.en;

async function request<T>(member: Member | null, path: string, expected: number | number[], method = "GET",
  data?: object, key = randomUUID(), server = api): Promise<T> {
  const response = await fetch(server + path, {
    method, signal: AbortSignal.timeout(10_000), body: data && JSON.stringify(data),
    headers: { ...(member && { Authorization: "Bearer " + member.token }),
      ...(data && { "Content-Type": "application/json", "Idempotency-Key": key }) },
  });
  const body = await response.json();
  expect([expected].flat(), method + " " + path + (response.ok ? "" : " " + JSON.stringify(body))).toContain(response.status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return body;
}

test("C2.1 preserves native results and confines requests to the owning organizer and exact source", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(120_000);
  const peer = await makeMember();
  const owner = signedIn;
  for (const member of [owner, peer]) finishPersonalOnboarding(member);
  const project = randomUUID(), foreignProject = randomUUID(), milestone = randomUUID(), metric = randomUUID();
  const observation = randomUUID(), progress = randomUUID(), report = randomUUID();
  const path = "/api/v1/projects/" + project + "/outcome-validation";
  const signature = "public.c21_outcomes_for_api(uuid,uuid,boolean,uuid,text,jsonb)";
  const before = sql(`select
    (select count(*)=3 and bool_and(relrowsecurity) from pg_class where relnamespace='private'::regnamespace and relname in
      ('c21_outcome_requests','c21_outcome_history','c21_outcome_fixture'))
    and not exists(select from pg_roles r cross join unnest(array['c21_outcome_requests','c21_outcome_history','c21_outcome_fixture']) t(name)
      where r.rolname in ('anon','authenticated','service_role') and has_table_privilege(r.rolname,'private.'||t.name,'select,insert,update,delete'))
    and has_function_privilege('service_role','${signature}','execute')
    and not has_function_privilege('anon','${signature}','execute')
    and not has_function_privilege('authenticated','${signature}','execute')
    and not exists(select from private.c21_outcome_fixture);`);
  expect(before).toBe("t");
  const proposal = { title: "Synthetic learning space", category: "education", country: "HT", department: "HT-CE",
    description: "Test outcome validation using a reported learning space." };
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${owner.id}','identity','verified','review','${peer.id}',now()),
      ('${peer.id}','identity','verified','review','${owner.id}',now());
    insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)
    values ('${project}','${owner.id}','${owner.id}',gen_random_uuid(),'x','approved','${owner.id}',now(),now()),
      ('${foreignProject}','${peer.id}','${peer.id}',gen_random_uuid(),'x','approved','${peer.id}',now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
    values ('${project}',1,'${owner.id}','${JSON.stringify(proposal)}'),
      ('${foreignProject}',1,'${peer.id}','${JSON.stringify(proposal)}');
    insert into private.project_execution(project_id,approved_revision,status)
    values ('${project}',1,'completed'),('${foreignProject}',1,'active');
    insert into private.project_milestones(id,project_id,creator_id,reviewer_id,request_key,request_digest,title,description,display_order,public_requested,status,version)
    values ('${milestone}','${project}','${owner.id}','${peer.id}',gen_random_uuid(),'x','Open the reading space',
      'Open reading hours were delivered.',0,false,'completed',4);
    insert into private.project_metrics(id,project_id,creator_id,name,unit,target)
    values ('${metric}','${project}','${owner.id}','Cancelled classes','classes',3);
    insert into private.project_metric_observations(id,project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference)
    values ('${observation}','${project}','${metric}','${owner.id}','2026-01-01','2026-01-31',0,'No classes were cancelled.','https://example.org/count');
    insert into private.project_progress_entries(id,project_id,author_id,reviewer_id,kind,visibility,state,request_key,
      request_digest,content,snapshot,approved_at,version,milestone_id)
    values ('${progress}','${project}','${owner.id}',null,'update','team','approved',gen_random_uuid(),'x',
      '{"title":"Space reached its first cohort","summary":"Regular reading sessions began.","references":[]}',null,now(),2,'${milestone}'),
      ('${report}','${project}','${owner.id}','${peer.id}','report','team','approved',gen_random_uuid(),'x',
      '{"title":"Final project report","summary":"The team delivered the scheduled sessions.","references":["https://example.org/report"]}',
      '{"completedOn":"2026-02-01"}',now(),4,null);`);
  const snapshot = () => sql(`select md5(jsonb_build_array(
    (select to_jsonb(p) from private.community_projects p where id='${project}'),
    (select to_jsonb(m) from private.project_milestones m where id='${milestone}'),
    (select to_jsonb(o) from private.project_metric_observations o where id='${observation}'),
    (select to_jsonb(x) from private.project_progress_entries x where id='${report}')
    )::text);`);
  const original = snapshot();

  await request(owner, path, 404);
  await page.goto("/projects/" + project + "/work?section=outcomes");
  await expect(page.getByText(copy.closed, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.choose, { exact: true })).toHaveCount(0);

  sql("insert into private.c21_outcome_fixture values(true);");
  try {
    await request(owner, path, 404, "GET", undefined, randomUUID(), "http://127.0.0.1:5301");
    await request(null, path, 401);
    await request(peer, path, 404);
    const getSource = async (kind: string) =>
      (await request<OutcomePage<OutcomeSource>>(owner, path + "/sources?sourceKind=" + kind, 200)).items[0];
    const first = await getSource("milestone"), observed = await getSource("observation");
    expect(first).toMatchObject({ id: milestone, revision: 4, result: { measurement: null, internallyReviewed: true } });
    expect(observed).toMatchObject({ id: observation, revision: 1,
      result: { measurement: 0, unit: "classes", internallyReviewed: false,
        evidence: [{ sourceId: observation, revision: 1, reference: "https://example.org/count" }] } });
    expect(await getSource("progress_report")).toMatchObject({ id: progress, result: { internallyReviewed: false } });
    expect(await getSource("accomplishment")).toMatchObject({ id: progress });
    expect(await getSource("final_report")).toMatchObject({ id: report, revision: 4,
      result: { endsOn: "2026-02-01", internallyReviewed: true } });

    const draft = { sourceKind: "milestone", sourceId: milestone, sourceRevision: first.revision, sourceFingerprint: first.fingerprint,
      classification: "output", explanation: "Validate the recorded reading hours." };
    await request(owner, path, 409, "POST", { ...draft, sourceRevision: 3 });
    await request(peer, path.replace(project, foreignProject), 409, "POST", draft);
    const key = randomUUID();
    const [one, two] = await Promise.all([
      request<OutcomeRequest>(owner, path, 201, "POST", draft, key),
      request<OutcomeRequest>(owner, path, 201, "POST", draft, key),
    ]);
    expect(one.id).toBe(two.id);
    expect(one.history).toHaveLength(1);
    await request(owner, path, 409, "POST", { ...draft, classification: "outcome" });
    await request(owner, path, 409, "POST", { ...draft, explanation: "Another explanation." }, key);

    const casePath = path + "/" + one.id;
    await request(peer, casePath, 404);
    await request(peer, casePath.replace(project, foreignProject), 404);
    await request(owner, casePath, 400, "PATCH", { action: "submit", expectedRevision: 1, confirmed: false });
    const updated = await request<OutcomeRequest>(owner, casePath, 200, "PATCH",
      { action: "edit", expectedRevision: 1, explanation: "Review the recorded delivery.", classification: "output" });
    expect(updated.revision).toBe(2);
    const submit = { action: "submit", expectedRevision: 2, confirmed: true };
    await request(owner, casePath, 409, "PATCH", { ...submit, expectedRevision: 1 });
    const restriction = randomUUID();
    sql(`insert into private.m23_restrictions (id,subject_id,capability,scope_kind,scope_id,authority,max_minutes,category,starts_at)
      values ('${restriction}','${owner.id}','project_update','project','${project}','founder',60,'integrity',now());`);
    await request(owner, casePath, 403, "PATCH", submit);
    sql(`delete from private.m23_restrictions where id='${restriction}';
      update private.project_milestones set version=5 where id='${milestone}';`);
    await request(owner, casePath, 409, "PATCH", submit);
    sql(`update private.project_milestones set version=4 where id='${milestone}';`);
    const results = await Promise.all([1, 2].map(() => request<OutcomeRequest | { error: object }>(owner, casePath, [200, 409], "PATCH", submit)));
    expect(results.filter((result) => "status" in result)).toHaveLength(1);
    expect((await request<OutcomeRequest>(owner, casePath, 200)).history.map((entry) => entry.action)).toEqual(["submit", "edit", "create"]);

    sql(`update private.community_projects set restricted_at=now() where id='${project}';`);
    await request(owner, casePath, 404);
    sql(`update private.community_projects set restricted_at=null where id='${project}';`);

    await page.reload();
    const panel = page.getByRole("region", { name: copy.heading });
    await panel.getByRole("button", { name: /Open the reading space/ }).click();
    await expect(panel.getByRole("status")).toHaveText(copy.submitted);
    await panel.locator("summary").filter({ hasText: copy.withdraw }).click();
    await panel.getByLabel(copy.confirmWithdraw).check();
    await panel.getByRole("button", { name: copy.withdraw, exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText(copy.withdrawn);
    await panel.locator("summary").filter({ hasText: copy.choose }).click();
    await panel.getByLabel(copy.kind).selectOption("observation");
    await panel.getByLabel(copy.source).selectOption(observation);
    await expect(panel.getByText("0 classes", { exact: true })).toBeVisible();
    await panel.getByRole("textbox", { name: new RegExp(copy.explanation.replace("?", "")) }).fill("Check the recorded zero.");
    await panel.getByRole("button", { name: copy.create }).click();
    await expect(panel.getByRole("status")).toHaveText(copy.draft);

    for (const locale of ["ht", "fr", "es"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByRole("heading", { name: outcomeMessages[locale].heading, exact: true })).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
    }
    expect(snapshot()).toBe(original);
  } finally {
    sql("delete from private.c21_outcome_fixture;");
  }
});

test("C2.1 uses native department and organization operator permissions", async ({ signedIn, makeMember }) => {
  const owner = signedIn;
  const member = await makeMember();
  const organization = randomUUID(), organizationProject = randomUUID();
  for (const actor of [owner, member]) finishPersonalOnboarding(actor);
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${owner.id}','identity','verified','review','${member.id}',now()),
      ('${member.id}','identity','verified','review','${owner.id}',now());
    insert into feed_data.community_memberships(community_id,user_id)
    select id,'${owner.id}' from feed_data.communities where kind='department';
    insert into feed_data.community_staff(community_id,user_id,role)
    select id,'${owner.id}','administrator' from feed_data.communities where kind='department';
    insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)
    values ('${organization}','c21-disposable-outcome','Test outcome institution','ngo','HT','verified','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role)
    values ('${organization}','${owner.id}','owner'),('${organization}','${member.id}','administrator');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
    values ('${owner.id}','${organization}','organization','approved',now());
    insert into private.community_projects(creator_id,community_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)
    select '${owner.id}',id,gen_random_uuid(),'x','approved','${owner.id}',now(),now()
    from feed_data.communities where kind='department';
    insert into private.community_projects(id,creator_id,organization_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)
    values ('${organizationProject}','${owner.id}','${organization}',gen_random_uuid(),'x','approved','${owner.id}',now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
    select p.id,1,'${owner.id}',jsonb_build_object('title','Test outcome','category','education','country','HT','department',c.department_code)
    from private.community_projects p left join feed_data.communities c on c.id=p.community_id where p.creator_id='${owner.id}';
    insert into private.project_execution(project_id,approved_revision,status,operator_id)
    select id,1,'active','${owner.id}' from private.community_projects where creator_id='${owner.id}';
    insert into private.c21_outcome_fixture values(true);`);
  try {
    const projects = sql(`select id from private.community_projects where creator_id='${owner.id}' and community_id is not null order by id;`).split(/\r?\n/);
    expect(projects).toHaveLength(10);
    const path = (project: string) => "/api/v1/projects/" + project + "/outcome-validation";
    for (const project of projects) {
      expect(await request(owner, path(project), 200)).toEqual({ items: [], nextCursor: null });
      await request(member, path(project), 404);
    }
    expect(sql(`select private.project_execution_role(p,'${member.id}') from private.community_projects p
      where p.id='${organizationProject}';`)).toBe('delegate');
    await request(owner, path(organizationProject), 200);
    await request(member, path(organizationProject), 404);
  } finally {
    sql("delete from private.c21_outcome_fixture;");
  }
});
