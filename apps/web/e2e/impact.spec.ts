import { randomUUID } from "node:crypto";
import { impactDepartments, type ImpactMapping, type ImpactOverview, type ImpactResponse } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";
import { impactCopy } from "../src/lib/impact-i18n";

const publicPath = "/api/v1/impact";
const founderPath = "/api/v1/admin/impact";
const reviewerPath = "/api/v1/private/impact-review";
const memberPath = "/api/v1/me/impact/mappings/";
const note = "The synthetic delivery and its reporting scope were independently reviewed.";
const year = 2025;

async function recent(person: Member) {
  const secret = await enroll(person);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: person.email, password: person.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw Error("Expected verifier in disposable project");
  const session = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (session.error) throw session.error;
  return { ...person, token: session.data.access_token };
}

async function request<T>(path: string, expected: number | number[], actor?: Member, workspace?: string, body?: object, method?: string): Promise<T> {
  const response = await fetch(api + path, { method: method ?? (body ? "PATCH" : "GET"), body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    headers: { ...(actor && { Authorization: "Bearer " + actor.token }), ...(workspace && { "X-Ayinou-Workspace": workspace }),
      ...(body && { "Content-Type": "application/json" }) },
  });
  const payload = await response.json();
  expect([expected].flat(), path + (response.ok ? "" : " " + JSON.stringify(payload))).toContain(response.status);
  if (path.startsWith(publicPath) || path.startsWith(founderPath) || path.startsWith(reviewerPath) || path.startsWith(memberPath)) {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  return payload as T;
}

const receipt = (action: string, expectedVersion: number, more: object = {}) =>
  ({ action, expectedVersion, requestId: randomUUID(), reason: note, confirmed: true, ...more });

function seedProject(owner: Member, department: string, sector: string, kind: "individual" | "organization" | "community" = "individual") {
  const project = randomUUID(), organization = randomUUID();
  const setup = kind === "organization" ? `insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)
    values('${organization}','impact-${organization.slice(0,8)}','Impact exercise organization','ngo','HT','verified','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${owner.id}','owner');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${owner.id}','${organization}','organization','approved',now());` : kind === "community" ?
    `insert into feed_data.community_memberships(community_id,user_id)
       select id,'${owner.id}' from feed_data.communities where department_code='${department}' and kind='department';
     insert into feed_data.community_staff(community_id,user_id,role)
       select id,'${owner.id}','administrator' from feed_data.communities where department_code='${department}' and kind='department';` : "";
  const authority = kind === "individual" ? ["owner_user_id", "'" + owner.id + "'"] : kind === "organization" ?
    ["organization_id", "'" + organization + "'"] : ["community_id", "(select id from feed_data.communities where department_code='" + department + "' and kind='department')"];
  sql(`${setup}
    insert into private.community_projects(id,creator_id,${authority[0]},submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      values('${project}','${owner.id}',${authority[1]},gen_random_uuid(),'x','approved','${owner.id}',now(),now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${owner.id}',jsonb_build_object('title','Synthetic impact project',
        'category','${sector}','country','HT','department','${department}','objectives','A disposable impact exercise',
        'references',jsonb_build_array(),'description','Project for testing impact reporting'));
    insert into private.project_execution(project_id,approved_revision,status,operator_id) values('${project}',1,'completed','${owner.id}');
    insert into private.project_operations_events(project_id,actor_id,action,detail,created_at)
      values('${project}','${owner.id}','execution_status','completed','${year}-12-31 12:00+00');`);
  return project;
}

function seedDisclosure(owner: Member, reviewer: Member, project: string, department: string,
  classification: string, quantity: number | null, reported: number, unit = "desks") {
  const metric = randomUUID(), source = randomUUID(), caseId = randomUUID(), finding = randomUUID(), publication = randomUUID();
  const measurement = quantity === null ? "null" : `jsonb_build_object('quantity',${quantity},'unit','${unit}',
    'startsOn','${year}-01-01','endsOn','${year}-12-31','methodology','SIGNED_DESK_HANDOVER_V1')`;
  sql(`insert into private.project_metrics(id,project_id,creator_id,name,unit,target)
     values('${metric}','${project}','${owner.id}','Observation ${source.slice(0,8)}','${unit}',8);
    insert into private.project_metric_observations(id,project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference)
      values('${source}','${project}','${metric}','${owner.id}','${year}-01-01','${year}-12-31',${reported},
        'The accepted observations cover the selected year','https://example.org/synthetic-source');
    insert into private.c21_outcome_requests(id,project_id,requester_id,source_kind,source_id,source_revision,source_fingerprint,
      result,classification,explanation,status,revision,created_at,submitted_at)
      select '${caseId}',p.id,'${owner.id}','observation',s.id,s.revision,repeat('0',64),s.result,'output',
        'The recorded delivery covers the approved year','submitted',2,now(),now()
      from private.community_projects p cross join lateral private.c21_sources(p,'${owner.id}','owner','observation','${source}',null,1) s
      where p.id='${project}';
    insert into private.c22_cases(id,department,state) values('${caseId}','${department}','decided');
    insert into private.c22_revisions(case_id,revision,submitted_revision,result,manifest,explanation)
      select id,1,revision,result-'evidence',result->'evidence','Synthetic evidence' from private.c21_outcome_requests where id='${caseId}';
    insert into private.c22_releases(case_id,revision,generation) values('${caseId}',1,1);
    insert into private.c22_findings(id,case_id,revision,release_generation,reviewer,lane,classification,explanation,limitations,measurement,available_at)
      values('${finding}','${caseId}',1,1,'${reviewer.id}','initial','${classification}','Private review',
        'The accepted evidence covers the recorded year.',${measurement},now()-interval '15 days');
    insert into private.c23_publications(id,case_id,project_id,department,finding_id,project_revision,state,consent_hash,approved_at)
      values('${publication}','${caseId}','${project}','${department}','${finding}',1,'approved',decode(repeat('a',64),'hex'),now());
    insert into private.c23_disclosures(publication_id,revision,finding_id,snapshot,fingerprint)
      select '${publication}',1,f.id,private.c23_snapshot(r,f,jsonb_build_object('title','Synthetic result','summary','A reviewed delivery',
        'limitations','Limited to the reporting year','includeReported',true),false),decode(repeat('a',64),'hex')
      from private.c21_outcome_requests r join private.c22_findings f on f.case_id=r.id where r.id='${caseId}';`);
  return { source, caseId, finding, publication, project, owner };
}

function seedNeedAssociation(author: Member, organizer: Member, reviewer: Member, project: string, kind: string) {
  const need = randomUUID(), finding = randomUUID(), publication = randomUUID(), proposal = randomUUID(), association = randomUUID();
  const community = "(select id from feed_data.communities where department_code='HT-CE' and kind='department')";
  sql(`
    insert into private.c11_needs(id,community_id,author_id,status,content)
      values('${need}',${community},'${author.id}','submitted','{"title":"Private association marker"}');
    insert into private.c12_events(id,need_id,community_id,actor_id,action,state,case_revision,evidence_revision)
      values('${finding}','${need}',${community},'${reviewer.id}','supported','supported',1,1);
    insert into private.c12_cases(need_id,state,reviewer,finding_id) values('${need}','supported','${reviewer.id}','${finding}');
    insert into private.c13_publications(id,need_id,state,published_at) values('${publication}','${need}','published',now());
    insert into private.c13_events(id,publication_id,actor,revision,action,state,finding,evidence_revision,content,audience,attribution)
      values('${proposal}','${publication}','${author.id}',1,'request','published','${finding}',1,
        '{"title":"Private association marker"}','community',false);
    update private.c13_publications set live_proposal='${proposal}' where id='${publication}';
    insert into private.c14_links(id,project_id,publication_id,publication_snapshot,project_revision,initiated_version,
      organizer,author,organizer_authority,purpose,reviewer,state,activated_at)
      values('${association}','${project}','${publication}','${proposal}',1,1,'${organizer.id}','${author.id}',
        '${kind}','The reviewed need and project have a common objective','${reviewer.id}','approved',now());`);
  return { id: association, author };
}

test("C2.4 seals safe impact slices across all departments and permanently suppresses invalidated inputs", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(180_000);
  await page.goto("/impact");
  for (const locale of ["en", "ht", "fr", "es"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.setViewportSize({ width: locale === "en" ? 1440 : 390, height: 844 });
    await page.reload();
    await expect(page.getByText(impactCopy(locale)("closed"), { exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(locale === "en" ? 1440 : 390);
  }
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
  expect((await request<ImpactResponse>(publicPath, 200)).state).toBe("disabled");
  await request(founderPath, [403,404], signedIn);

  expect(sql(`select (select count(*)=8 and bool_and(relrowsecurity) from pg_class where relnamespace='private'::regnamespace
    and relname like 'c24_%' and relkind='r') and not exists(select from pg_class c
    cross join unnest(array['anon','authenticated','service_role','authenticator']) roles(role)
    where c.relnamespace='private'::regnamespace and c.relname like 'c24_%' and c.relkind='r'
      and has_table_privilege(roles.role,c.oid,'select,insert,update,delete'))
    and not has_function_privilege('anon','public.c24_impact_for_api(int,text,text)','execute')
    and not has_function_privilege('authenticated','public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
    and has_function_privilege('service_role','public.c24_impact_for_api(int,text,text)','execute')
    and not exists(select from private.c24_fixture) and not exists(select from private.c24_definitions where state='active');`)).toBe("t");

  const [founderAccount, mapperAccount, governorAccount, evidence, other, ...owners] = await Promise.all(
    Array.from({ length: 10 }, () => makeMember()));
  for (const person of [founderAccount, mapperAccount, governorAccount, evidence, other, ...owners]) finishPersonalOnboarding(person);
  const verification = [founderAccount, mapperAccount, governorAccount, evidence, ...owners].map(({ id }) =>
    "('" + id + "','identity','verified','review','" + other.id + "',now())").join(",");
  sql(`insert into private.platform_bootstrap(user_id) values('${founderAccount.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founderAccount.id}','${founderAccount.id}','first_account_bootstrapped','Synthetic C2.4 Founder');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values ${verification};
    insert into public.user_settings(user_id,discoverable) values ${owners.map(({ id }) => "('" + id + "',true)").join(",")}
      on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id in (${owners.map(({ id }) => "'" + id + "'").join(",")});
    insert into private.c21_outcome_fixture values(true); insert into private.c22_fixture values(true);
    insert into private.c23_fixture values(true); insert into private.c24_fixture values(true);`);
  const [founder, mapper, governor] = await Promise.all([founderAccount, mapperAccount, governorAccount].map(recent));
  const founderWorkspace = (await request<{ id: string }>("/api/v1/me/private-workflows", 200, founder, undefined, { kind: "admin_workspace" }, "POST")).id;
  const publicationPath = "/api/v1/private/project-outcome-publication";
  const c23Workspace = (await request<{ id: string }>(publicationPath + "/workspace", 200, founder, undefined, { lane: "admin" }, "POST")).id;
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  for (const actor of [mapper, governor]) {
    await request(publicationPath + "/roster", 200, founder, c23Workspace, {
      action: "grant", requestId: randomUUID(), expectedVersion: 0, note, confirmed: true,
      department: "HT-CE", target: actor.id, expiresAt: expiry,
    }, "POST");
  }
  const reviewerWorkspace = async (actor: Member) => (await request<{ id: string }>(publicationPath + "/workspace", 200,
    actor, undefined, { lane: "review" }, "POST")).id;
  const [mapperWorkspace, governorWorkspace] = await Promise.all([mapper, governor].map(reviewerWorkspace));

  try {
    await request(founderPath, [401,403], signedIn, founderWorkspace);
    await request(reviewerPath, 403, governor, mapperWorkspace);
    await request(reviewerPath, 403, governor, governorWorkspace, receipt("approve_definition", 1, { code: "school_desks", methodReviewed: true }));
    await request(founderPath, 200, founder, founderWorkspace, receipt("grant", 0, { target: governor.id, expiresAt: expiry }));
    await request(reviewerPath, 200, governor, governorWorkspace, receipt("approve_definition", 1, { code: "school_desks", methodReviewed: true }));
    const configure = { years: [year], sectors: ["education", "environment"], departments: impactDepartments,
      enabled: true, links: true, measurements: true, needs: true };
    const command = receipt("configure", 0, configure);
    expect(await request(founderPath, 200, founder, founderWorkspace, command)).toEqual({ version: 1 });
    expect(await request(founderPath, 200, founder, founderWorkspace, command)).toEqual({ version: 1 });
    await request(founderPath, 409, founder, founderWorkspace, { ...command, links: false });
    expect(await request(publicPath, 200)).toMatchObject({ state: "unavailable", filters: { departments: expect.arrayContaining([...impactDepartments]) } });
    await request(publicPath + "?sector=education&year=" + year + "&department=HT-unknown", 400);
    await request(publicPath + "?sector=education&year=" + year + "&startsOn=2025-06-01", 400);

    const centre = owners.map((owner, index) =>
      seedProject(owner, "HT-CE", "education", index === 0 ? "organization" : index === 1 ? "community" : "individual"));
    sql(`insert into private.c11_intake_fixture values(true,true); insert into private.c12_fixture values(true);
      insert into private.c13_fixture values(true); insert into private.c14_fixture values(true);
      insert into feed_data.community_memberships(community_id,user_id)
      select c.id,actor from feed_data.communities c cross join unnest(array[${owners.map(({ id }) => "'" + id + "'::uuid").join(",")}]) actor
      where c.department_code='HT-CE' and c.kind='department' on conflict do nothing;`);
    const needs = centre.map((project, index) => seedNeedAssociation(owners[(index + 1) % owners.length], owners[index], evidence,
      project, index === 0 ? "organization" : index === 1 ? "community" : "individual"));
    const needPath = (id: string) => "/api/v1/me/impact/needs/" + id;
    await request(needPath(needs[0].id), 404, other);
    expect(await request(needPath(needs[0].id), 200, needs[0].author)).toEqual({ consented: false, version: 0 });
    for (const need of needs) await request(needPath(need.id), 200, need.author, undefined, receipt("allow_need", 0));
    const mapped = centre.map((project, index) => seedDisclosure(owners[index], evidence, project, "HT-CE",
      index === 0 ? "partially_supported" : "supported", 0, index === 0 ? 6 : 0));
    const adverse = ["insufficient_evidence", "not_supported"].map((classification) => {
      const project = seedProject(owners[0], "HT-OU", "education");
      return seedDisclosure(owners[0], evidence, project, "HT-OU", classification, null, 5);
    });
    const invalid = seedDisclosure(owners[0], evidence, seedProject(owners[0], "HT-OU", "education"), "HT-OU", "supported", 6, 6, "chairs");
    const readMapping = (item: typeof mapped[number]) => request<ImpactMapping>(memberPath + item.publication, 200, item.owner);
    expect((await readMapping(invalid)).catalog).toEqual([]);
    for (const item of adverse) expect((await readMapping(item)).catalog).toEqual([]);
    const submit = (item: typeof mapped[number], version: number, deliveryReference: string, status = 200) =>
      request(memberPath + item.publication, status, item.owner, undefined,
        receipt("submit_mapping", version, { code: "school_desks", definitionVersion: 1, deliveryReference }));
    const approve = (item: typeof mapped[number], version: number) =>
      request(reviewerPath + "/mappings/" + item.publication, 200, mapper, mapperWorkspace,
        receipt("approve_mapping", version, { methodReviewed: true }));
    await request(memberPath + mapped[0].publication, 404, other);
    await submit(invalid, 0, "INCOMPATIBLE_EXAMPLE", 409);
    for (const [index, item] of mapped.entries()) await submit(item, 0, "DESK_DELIVERY_" + index);
    await request(reviewerPath + "/mappings?scope=HT-OU", 403, mapper, mapperWorkspace);
    const queue = await request<{ items: unknown[] }>(reviewerPath + "/mappings?scope=HT-CE", 200, mapper, mapperWorkspace);
    expect(queue.items).toHaveLength(5);
    expect(await request(reviewerPath + "/mappings/" + mapped[0].publication, 200, mapper, mapperWorkspace))
      .toMatchObject({ reviewReference: "DESK_DELIVERY_0", method: "SIGNED_DESK_HANDOVER_V1" });
    await request(reviewerPath + "/mappings/" + mapped[0].publication, 403, founder, founderWorkspace,
      receipt("approve_mapping", 1, { methodReviewed: true }));
    for (const item of mapped) await approve(item, 1);

    const snapshot = () => JSON.parse(sql(`select private.c24_snapshot(${year},'education',s)->'cells' from private.c24_settings s;`));
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "available", value: 0 });
    await submit(mapped[1], 2, "DESK_DELIVERY_0");
    await approve(mapped[1], 3);
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "suppressed", value: null });
    await submit(mapped[1], 4, "DESK_DELIVERY_1");
    await approve(mapped[1], 5);
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "available", value: 0 });

    const query = (department: string, sector = "education") => publicPath + "?" + new URLSearchParams({
      department, sector, year: String(year),
    });
    expect((await request<ImpactResponse>(query("HT-CE"), 200)).state).toBe("unavailable");
    await request(founderPath, 200, founder, founderWorkspace, receipt("propose_report", 0, { year, scope: "education" }));
    const overview = await request<ImpactOverview>(reviewerPath, 200, governor, governorWorkspace);
    const candidate = overview.releases.find((release) => release.sector === "education")!;
    expect(candidate.preview?.national.completed).toEqual({ state: "suppressed", value: null });
    const approveBody = { year, scope: "education", fingerprint: candidate.fingerprint, methodReviewed: true };
    await request(reviewerPath, 403, mapper, mapperWorkspace, receipt("seal_report", 1, approveBody));
    await request(reviewerPath, 409, governor, governorWorkspace, receipt("seal_report", 1, { ...approveBody, fingerprint: "f".repeat(64) }));
    await request(reviewerPath, 200, governor, governorWorkspace, receipt("seal_report", 1, approveBody));
    const centreReport = await request<ImpactResponse>(query("HT-CE"), 200);
    expect(centreReport).toMatchObject({ state: "available", report: {
      completed: { state: "available", value: 5 }, reviewed: { state: "available", value: 5 },
      supported: { state: "available", value: 5 }, linkedNeeds: { state: "available", value: 5 }, measurements: [{ result: { state: "available", value: 0 } }],
    } });
    expect(await request(query("national"), 200)).toMatchObject({ report: { completed: { state: "suppressed", value: null },
      reviewed: { state: "suppressed", value: null }, participating: { state: "suppressed", value: null },
      linkedNeeds: { state: "suppressed", value: null }, measurements: [{ result: { state: "suppressed", value: null } }] } });
    expect(await request(query("HT-OU"), 200)).toMatchObject({ report: { completed: { state: "suppressed", value: null },
      measurements: [{ result: { state: "suppressed", value: null } }] } });
    for (const department of impactDepartments.filter((item) => !["HT-CE", "HT-OU"].includes(item))) {
      expect(snapshot()[department].completed).toEqual({ state: "unavailable", value: null });
    }
    expect((await request<ImpactResponse>(query("HT-CE", "environment"), 200)).state).toBe("unavailable");
    expect(JSON.stringify(centreReport)).not.toMatch(/Private review|Private association marker|synthetic-source|delivery_hash|requester_id|fingerprint|findingId/);

    await page.goto("/impact?year=" + year + "&sector=education&department=HT-CE");
    await expect(page.getByRole("heading", { name: impactCopy("en")("measurements"), exact: true })).toBeVisible();
    await expect(page.getByText("0 desks", { exact: true })).toBeVisible();
    const departmentFilter = page.getByRole("combobox", { name: "Department", exact: true });
    expect(await departmentFilter.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).sort())).toEqual([...impactDepartments, "national"].sort());
    await departmentFilter.selectOption("national");
    await page.getByRole("button", { name: "View report" }).click();
    await expect(page.getByText("Withheld", { exact: true }).first()).toBeVisible();

    sql(`update private.c22_releases set revoked_at=now() where case_id='${mapped[0].caseId}';`);
    expect((await request<ImpactResponse>(query("HT-CE"), 200)).state).toBe("suppressed");
    sql(`update private.c22_releases set revoked_at=null where case_id='${mapped[0].caseId}';`);
    expect((await request<ImpactResponse>(query("national"), 200)).state).toBe("suppressed");
    await request(founderPath, 409, founder, founderWorkspace, receipt("propose_report", 3, { year, scope: "education" }));
    await page.reload();
    await expect(page.getByText(impactCopy("en")("withheld"), { exact: true })).toBeVisible();

    sql(`with seeds as (
      select gen_random_uuid() id, unnest(array[${owners.map(({ id }) => "'" + id + "'::uuid").join(",")}]) owner
      from generate_series(1,32)
    ), projects as (
      insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      select id,owner,owner,gen_random_uuid(),'x','approved',owner,now(),now(),now() from seeds returning id,owner_user_id
    ), revisions as (
      insert into private.project_revisions(project_id,revision,author_id,proposal)
      select id,1,owner_user_id,'{"title":"Synthetic planting project","country":"HT","department":"HT-CE","category":"environment","references":[]}'
      from projects returning project_id
    ), executions as (
      insert into private.project_execution(project_id,approved_revision,status) select project_id,1,'completed' from revisions
      returning project_id
    )
    insert into private.project_operations_events(project_id,action,detail,created_at)
    select project_id,'execution_status','completed','${year}-04-20T12:00:00Z' from executions;`);
    expect(sql(`select count(*) from private.c24_projects(${year},'environment',array['HT-CE']);`)).toBe("160");
    const benchmark = JSON.parse(sql(`explain (analyze,format json) select private.c24_snapshot(${year},'environment',s) from private.c24_settings s;`));
    expect(benchmark[0]["Execution Time"]).toBeLessThan(2500);
    console.log("C2.4 benchmark (160 eligible projects):", benchmark[0]["Execution Time"], "ms");
    const performance = JSON.parse(sql(`explain (analyze,format json) select private.c24_snapshot(${year},'education',s) from private.c24_settings s;`));
    expect(performance[0]["Execution Time"]).toBeLessThan(2500);
    console.log("C2.4 snapshot execution time for the mixed synthetic cohort:", performance[0]["Execution Time"], "ms");
  } finally {
    sql(`delete from private.c24_fixture; delete from private.c23_fixture; delete from private.c22_fixture;
      delete from private.c21_outcome_fixture; delete from private.c14_fixture; delete from private.c13_fixture;
      delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap where user_id='${founderAccount.id}';`);
  }
});
