import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { volunteerDepartments } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";

import { requirementCopy } from "../src/lib/requirement-i18n";

const admin = "/api/v1/admin/volunteer-settings/requirements";
const work = (id: string) => "/api/v1/projects/" + id + "/work";
const rules = (id: string, opportunity?: string) => work(id) + "/requirements" + (opportunity ? "/" + opportunity : "");
const change = (action: string, expectedVersion: number, input = {}) => ({ action, expectedVersion, requestId: randomUUID(), ...input });
const requirements = {
  skills: [{ code: "literacy_tutoring", priority: "required", proficiency: "beginner", experienceMin: null, experienceMax: null },
    { code: "carpentry", priority: "preferred", proficiency: "advanced", experienceMin: 2, experienceMax: 10 }],
  languages: [{ code: "ht", priority: "preferred", proficiency: null }],
  mode: "remote", hoursPerWeek: 3, durationWeeks: 4, beginnerFriendly: true, screening: true,
};
async function call(path: string, expected: number | number[], member?: Member, body?: object, method?: string, workspace?: string) {
  const response = await fetch(api + path, { method: method ?? (body ? "PATCH" : "GET"), signal: AbortSignal.timeout(10_000),
    headers: { ...(member ? { Authorization: "Bearer " + member.token } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      ...(workspace ? { "X-Ayinou-Workspace": workspace } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  expect([expected].flat(), path + " " + JSON.stringify(data)).toContain(response.status);
  return { data, status: response.status };
}

test("structured requirements preserve native access, original applications and approved geography", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(120_000);
  const owner = signedIn, applicant = await makeMember(), outsider = await makeMember();
  [owner, applicant, outsider].forEach(finishPersonalOnboarding);
  const organization = randomUUID(), individual = randomUUID(), orgProject = randomUUID(), privateProject = randomUUID();
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${owner.id}','identity','verified','review','${applicant.id}',now());
    update public.profiles set is_visible=true where user_id='${owner.id}';
    insert into public.user_settings(user_id,discoverable) values('${owner.id}',true)
      on conflict(user_id) do update set discoverable=true;
    insert into feed_data.community_memberships(community_id,user_id)
      select id,'${owner.id}' from feed_data.communities where kind='department';
    insert into feed_data.community_staff(community_id,user_id,role)
      select id,'${owner.id}','administrator' from feed_data.communities where kind='department';
    insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)
      values ('${organization}','c32-disposable-org','Test volunteer institution','ngo','HT','verified','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role)
      values ('${organization}','${owner.id}','owner');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values ('${owner.id}','${organization}','organization','approved',now());
    insert into private.community_projects(creator_id,community_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)
      select '${owner.id}',id,gen_random_uuid(),'x','approved','${owner.id}',now(),now() from feed_data.communities where kind='department';
    insert into private.community_projects(id,creator_id,organization_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)
      values ('${orgProject}','${owner.id}','${organization}',gen_random_uuid(),'x','approved','${owner.id}',now(),now());
    insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      values ('${individual}','${owner.id}','${owner.id}',gen_random_uuid(),'x','approved','${owner.id}',now(),now(),now()),
        ('${privateProject}','${owner.id}','${owner.id}',gen_random_uuid(),'x','approved','${owner.id}',now(),now(),null);
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      select p.id,1,'${owner.id}',jsonb_build_object('title','Synthetic workshop','category','education',
        'country','HT','department',coalesce(c.department_code,'HT-OU'),'publishRequested',true)
      from private.community_projects p left join feed_data.communities c on c.id=p.community_id where p.creator_id='${owner.id}';
    insert into private.project_execution(project_id,approved_revision,status,operator_id)
      select id,1,'active','${owner.id}' from private.community_projects where creator_id='${owner.id}';
    insert into private.project_opportunities(project_id,manager_id,title,description,skills,commitment,remote,capacity)
      select id,'${owner.id}','Reading sessions','Help at a sample workshop.','Reading','Three hours a week',true,1
      from private.community_projects where creator_id='${owner.id}';`);
  const native = await call(work(individual),200,owner);
  const opportunity = native.data.opportunities[0].id;
  await call(rules(individual),401);
  expect((await call(rules(individual),200,owner)).data).toEqual({ state:"closed" });
  await call(rules(individual,opportunity),403,owner,change("draft",0,{ requirements }));
  expect(sql(`select count(*)=3 and bool_and(relrowsecurity and not has_table_privilege('authenticated',oid,'select,insert,update,delete'))
    and not has_function_privilege('authenticated','public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)','execute')
    from pg_class where relnamespace='private'::regnamespace and relkind='r' and relname like 'c32_%';`)).toBe("t");
  sql("insert into private.c32_fixture values(true);");
  try {
    const projects = sql(`select p.id||','||o.id||','||private.c22_department(p)
      from private.community_projects p join private.project_opportunities o on o.project_id=p.id
      where p.creator_id='${owner.id}' and p.community_id is not null order by private.c22_department(p);`).split(/\r?\n/);
    const departments: string[] = [];
    for (const entry of projects) {
      const [project, opportunityId, department] = entry.split(",");
      departments.push(department);
      const regional = await call(rules(project),200,owner);
      expect(regional.data).toMatchObject({ department, items:[{ editable:true }] });
      await call(rules(project,opportunityId),200,owner,change("draft",0,{ requirements:{ ...requirements, mode:"hybrid" } }));
    }
    expect(departments).toEqual([...volunteerDepartments].sort());
    const org = (await call(rules(orgProject),200,owner)).data.items[0].opportunityId;
    sql(`update private.project_opportunities set remote=false where id='${org}';`);
    await call(rules(orgProject,org),200,owner,change("draft",0,{ requirements:{ ...requirements,mode:"on_site" } }));
    for (const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{ name:"ayinou-locale",value:locale,url:web }]);
      const width = locale==="en" ? 1440 : 390;
      await page.setViewportSize({width,height:900});
      await page.goto("/projects/" + orgProject + "/work?section=volunteers");
      const copy = requirementCopy(locale);
      await expect(page.getByText(copy("unpaid"),{ exact:false }).filter({ visible:true })).toBeVisible();
      const draftPanel = page.locator("summary").filter({ hasText:copy("draft") });
      await expect(draftPanel).toBeVisible();
      await draftPanel.press("Enter");
      await expect(page.getByText(copy("preview"),{ exact:true })).toBeVisible();
      await expect(page.getByRole("button",{ name:copy("publish"),exact:true })).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(width);
      if (locale==="en") {
        await page.getByRole("button",{ name:"Switch to dark theme",exact:true }).click();
        await expect(page.getByText(copy("preview"),{ exact:true })).toBeVisible();
        await page.getByRole("button",{ name:"Switch to light theme",exact:true }).click();
      }
    }
    await call(rules(privateProject),403,outsider);
    const expired = (await call(rules(privateProject),200,owner)).data.items[0].opportunityId;
    sql(`update private.project_opportunities set closes_on=current_date-1 where id='${expired}';`);
    expect((await call(rules(privateProject),200,owner)).data.items[0].editable).toBe(false);
    await call(rules(privateProject,expired),409,owner,change("draft",0,{ requirements }));
    await call(rules(individual,org),403,owner,change("draft",0,{ requirements }));
    await call(rules(individual,opportunity),403,applicant,change("draft",0,{ requirements }));
    await call(rules(individual,opportunity),400,owner,change("draft",0,{ requirements:{ ...requirements, skills:[requirements.skills[0],requirements.skills[0]] } }));
    await call(rules(individual,opportunity),400,owner,change("draft",0,{ requirements:{ ...requirements,
      skills:[{ ...requirements.skills[0], experienceMin:3 }] } }));
    sql("insert into private.c31_settings values(true,1,array['education'],array['experience']);");
    await call(rules(individual,opportunity),409,owner,change("draft",0,{ requirements }));
    sql("delete from private.c31_settings;");
    const draft = change("draft",0,{ requirements });
    await call(rules(individual,opportunity),200,owner,draft);
    await call(rules(individual,opportunity),200,owner,draft);
    expect((await call(rules(individual),200,applicant)).data.items).toEqual([]);
    sql("update private.c31_skills set status='retired' where code='carpentry';");
    await call(rules(individual,opportunity),409,owner,change("publish",1,{ confirmed:true }));
    sql("update private.c31_skills set status='active' where code='carpentry';");
    const results = await Promise.all([call(rules(individual,opportunity),[200,409],owner,change("publish",1,{ confirmed:true })),
      call(rules(individual,opportunity),[200,409],owner,change("draft",1,{ requirements }))]);
    expect(results.map(({ status }) => status).sort()).toEqual([200,409]);
    const model = (await call(rules(individual),200,owner)).data.items[0];
    if (!model.published) await call(rules(individual,opportunity),200,owner,change("publish",2,{ confirmed:true }));
    const published = (await call(rules(individual),200,applicant)).data.items[0];
    expect(published.published).toMatchObject({ department:"HT-OU",projectRevision:1,capacity:1,mode:"remote",screening:true });
    expect(published.draft).toBeNull();
    const application = await call(work(individual),200,applicant,{ action:"volunteer_apply",id:opportunity },"POST");
    await call(rules(individual,opportunity),409,owner,change("draft",published.version,{ requirements }));
    await call(work(individual),200,owner,{ action:"volunteer_offer",id:application.data.id,reason:"Please confirm your availability." },"POST");
    await call(work(individual),200,applicant,{ action:"volunteer_confirm",id:application.data.id },"POST");
    expect((await call(work(individual),200,applicant)).data.role).toBe("volunteer");
    expect((await call(rules(individual),200,outsider)).data.items[0].eligible).toBe(false);
    await call(work(individual),200,owner,{ action:"opportunity_close",id:opportunity },"POST");
    expect((await call(rules(individual),200,applicant)).data.items[0].published).toEqual(published.published);
    expect((await call(rules(individual),200,outsider)).data.items).toEqual([]);
  } finally { sql("delete from private.c32_fixture;"); }
});

test("Founder may prepare requirements settings with no operational activation", async ({ signedIn, makeMember }) => {
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const key = await enroll(founder);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await client.auth.signInWithPassword({ email:founder.email,password:founder.password })).error).toBeNull();
    const factor = (await client.auth.mfa.listFactors()).data!.totp[0];
    const result = await client.auth.mfa.challengeAndVerify({ factorId:factor.id,code:totp(key) });
    const staff = { ...founder, token: result.data!.access_token };
    const opened = await call("/api/v1/me/private-workflows",200,staff,{ kind:"admin_workspace" },"POST");
    const workspace = opened.data.id;
    await call(admin,403,signedIn,undefined,undefined,workspace);
    await call(admin,403,staff,undefined,undefined,randomUUID());
    expect((await call(admin,200,staff,undefined,undefined,workspace)).data.availableSkills).toBe(15);
    const config = change("configure",0,{ confirmed:true,reason:"Prepare disposable requirement settings.",
      fields:["languages"], categories:["education"], modes:["remote"], maxSkills:3,maxLanguages:2 });
    await call(admin,400,staff,{ ...config, enabled:true },undefined,workspace);
    await call(admin,200,staff,config,undefined,workspace);
    await call(admin,200,staff,config,undefined,workspace);
    await call(admin,409,staff,{ ...config, requestId:randomUUID() },undefined,workspace);
    const prepared = await call(admin,200,staff,undefined,undefined,workspace);
    expect(prepared.data).toMatchObject({ availableSkills:1,settings:{ version:1,fields:["languages"] } });
    expect(sql("select not exists(select from private.c31_fixture) and not exists(select from private.c32_fixture) and not exists(select from private.c31_profiles);")).toBe("t");
  } finally { sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`); }
});

test("legacy Project Work SQL validates the current native session and workflow", () => {
  const file = resolve(__dirname,"../../../supabase/tests/project_work_rollback.sql");
  sql("begin;\n" + readFileSync(file,"utf8") + "\nrollback;");
});
