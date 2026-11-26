import { randomBytes, randomUUID } from "node:crypto";
import { api, enroll, expect, finishPersonalOnboarding, localClient, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";
import { disposableDatabaseCommand, rehearsalSql } from "./impact-rehearsal";
import { activationCopy } from "../src/lib/activation-i18n";

const admin = "/api/v1/admin/volunteer-settings/activation";
const profile = "/api/v1/me/volunteer-profile";
const matches = "/api/v1/me/volunteer-matches";
const inbox = "/api/v1/me/volunteer-recruitment";
const opaque = () => ({ requestId: randomUUID() });
type Stage = "intake" | "requirements" | "matching" | "discovery" | "recruitment" | "all";
type Action = "enable" | "pause" | "resume" | "emergency_pause";
const requirements = { mode: "remote", hoursPerWeek: 4, durationWeeks: 3, beginnerFriendly: false, screening: false,
  skills: [{ code: "literacy_tutoring", priority: "required", proficiency: "intermediate", experienceMin: 1, experienceMax: null }],
  languages: [{ code: "ht", priority: "required", proficiency: "intermediate" }] };
const profileInput = {
  summary: "Private synthetic volunteer profile", skills: [{ code: "literacy_tutoring", proficiency: "advanced", experience: 3 }],
  languages: [{ code: "ht", proficiency: "advanced" }], mode: "remote", commitment: "four_eight",
  departments: ["HT-OU"], nationwide: false, availability: "available", expiresOn: null,
  consent: { matching: true, discovery: false, profileDisplay: true },
};

async function call(path: string, member?: Member, body?: object, method = body ? "PATCH" : "GET", workspace?: string, origin = api) {
  const response = await fetch(origin + path, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { ...(member ? { Authorization: "Bearer " + member.token } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      ...(workspace ? { "X-Ayinou-Workspace": workspace } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function check(status: number, ...args: Parameters<typeof call>) {
  const result = await call(...args);
  expect(result.status, args[0] + " " + JSON.stringify(result.data)).toBe(status);
  return result.data;
}

function recover() {
  const tables = ["public.profiles","private.c31_skills","private.c31_profiles","private.c31_selections","private.c31_consents",
    "private.c32_requirements","private.c33_pause","private.c33_dismissed","private.c34_contact","private.c34_invitations",
    "private.project_applications","private.project_invitations","private.project_team","private.project_tasks","feed_data.notifications",
    "private.c31_admin_history","private.c32_configuration","private.c33_configuration","private.c34_configuration",
    "private.c35_events","private.c35_stage","supabase_migrations.schema_migrations"];
  const sql = tables.map(table => `select '${table}',count(*),md5(string_agg(to_jsonb(r)::text,'' order by to_jsonb(r)::text)) from ${table} r`).join(" union all ");
  const fingerprint = rehearsalSql(sql);
  const backup = disposableDatabaseCommand("pg_dump", ["-U","supabase_admin","-d","postgres","--format=custom",
    "--exclude-table-data=private.c35_fixture","--exclude-table-data=private.c31_fixture","--exclude-table-data=private.c32_fixture",
    "--exclude-table-data=private.c33_fixture","--exclude-table-data=private.c34_fixture"]);
  const target = "c35_restore_" + randomBytes(6).toString("hex");
  disposableDatabaseCommand("createdb", ["-U","supabase_admin","--template=template0",target]);
  try {
    disposableDatabaseCommand("pg_restore", ["-U","supabase_admin","-d",target,"--exit-on-error","--single-transaction"], backup);
    expect(rehearsalSql(sql,target)).toBe(fingerprint);
    expect(rehearsalSql(`select not private.c35_gate('recruitment',true) and not private.c35_gate('intake',true)
      and exists(select from private.c34_invitations where status='invalidated')
      and exists(select from private.c34_invitations where status='application_initiated')
      and exists(select from private.c31_consents where not matching and not discovery)
      and exists(select from private.c35_stage where status='paused')
      and not exists(select from private.c35_stage where status='active');`,target)).toBe("t");
    console.log("C3 disposable recovery",JSON.stringify({ bytes:backup.length,fingerprints:tables.length,operationalGates:"closed" }));
  } finally {
    disposableDatabaseCommand("dropdb",["-U","supabase_admin","--if-exists",target]);
    backup.fill(0);
  }
}

test("Founder activation controls the complete native volunteer lifecycle, emergency pause and isolated recovery", async ({ page,context,signedIn,makeMember }) => {
  test.setTimeout(150_000);
  const member = signedIn, founder = await makeMember(), organizer = await makeMember({visible:true}), other = await makeMember({visible:true});
  [member,founder,organizer,other].forEach(finishPersonalOnboarding);
  sql(`update public.profiles set is_visible=true where user_id in ('${member.id}','${organizer.id}','${other.id}');
    insert into public.user_settings(user_id,discoverable) values('${member.id}',true),('${organizer.id}',true),('${other.id}',true)
      on conflict(user_id) do update set discoverable=true;
    insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${organizer.id}','identity','verified','review','${founder.id}',now());`);
  const key = await enroll(founder);
  const browserClient = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await browserClient.auth.signInWithPassword({email:founder.email,password:founder.password})).error).toBeNull();
  const factor = (await browserClient.auth.mfa.listFactors()).data!.totp[0];
  const elevated = await browserClient.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(key)});
  expect(elevated.error).toBeNull();
  const staff = { ...founder,token:elevated.data!.access_token };
  const workspace = (await check(200,"/api/v1/me/private-workflows",staff,{kind:"admin_workspace"},"POST")).id;
  let revision = 0;
  const read = async () => {
    const result = await check(200,admin,staff,undefined,"GET",workspace);
    revision = result.version;
    return result;
  };
  const initial = await read();
  const input = (panel: typeof initial, capability: Stage, action: Action) => ({
    capability, action, configuration:panel.configuration, expectedVersion:panel.version, confirmed:true, ...opaque(),
    reason:"Disposable rehearsal of staged volunteer activation and dependencies.",
  });
  const command = async (body: ReturnType<typeof input>, status=200) => {
    const result = await check(status,admin,staff,body,"PATCH",workspace);
    if (status===200) revision = Math.max(revision,result.version);
    return result;
  };
  const change = (capability: Stage, action: Action, status=200) => command(input({...initial,version:revision},capability,action),status);
  await check(401,admin);
  await check(403,admin,member,undefined,"GET",workspace);
  await check(403,admin,staff,undefined,"GET",randomUUID());
  await check(403,admin,member,input(initial,"intake","enable"),"PATCH",workspace);
  expect(initial.environmentReady).toBe(false);
  expect(initial.stages).toHaveLength(5);
  expect(initial.stages.every((stage: {status:string}) => stage.status==="disabled")).toBe(true);
  expect((await call(admin,staff,undefined,"GET",workspace)).headers.get("cache-control")).toContain("no-store");
  await command(input(initial,"intake","enable"),403);
  expect(sql(`select not has_function_privilege('authenticated','public.c35_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','execute')
    and has_function_privilege('service_role','public.c35_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','execute')
    and not has_table_privilege('service_role','private.c35_stage','select,update');`)).toBe("t");
  sql("insert into private.c35_fixture values(true,true,true,true);");
  try {
    await change("recruitment","enable",403);
    await change("discovery","enable",403);
    const start = input(await read(),"intake","enable");
    expect(await command(start)).toMatchObject({affected:["intake"]});
    expect(await command(start)).toMatchObject({affected:["intake"]});
    await command({...start,...opaque()},409);
    await change("requirements","enable");
    await change("discovery","enable");
    expect((await read()).stages.find((stage:{capability:string})=>stage.capability==="matching").status).toBe("disabled");
    await change("matching","enable");
    await change("recruitment","enable");

    await check(200,profile,member,{action:"save",expectedVersion:0,...opaque(),...profileInput});
    const project = randomUUID();
    sql(`insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,
      submitted_by,submitted_at,approved_at,directory_published_at) values('${project}','${organizer.id}','${organizer.id}',gen_random_uuid(),'c35',
      'approved','${organizer.id}',now(),now(),now());
      insert into private.project_revisions(project_id,revision,author_id,proposal)
        values('${project}',1,'${organizer.id}','{"title":"Reading rehearsal","country":"HT","department":"HT-OU","category":"education","publishRequested":true}');
      insert into private.project_execution(project_id,approved_revision,status,operator_id) values('${project}',1,'active','${organizer.id}');`);
    const work = "/api/v1/projects/" + project + "/work";
    const native = (who: Member, action: string, input: object) => check(200,work,who,{action,...input},"POST");
    const opportunity = async () => {
      const created = await native(organizer,"opportunity_publish",{title:"Practice reading group",description:"Help coordinate a disposable reading rehearsal.",
        skills:"Literacy",commitment:"Four hours",remote:true,capacity:2,closesOn:null});
      const scoped = work + "/requirements/" + created.id;
      await check(200,scoped,organizer,{action:"draft",expectedVersion:0,...opaque(),requirements});
      await check(200,scoped,organizer,{action:"publish",expectedVersion:1,...opaque(),confirmed:true});
      return {id:created.id,scoped};
    };
    const target = await opportunity();
    expect((await check(200,matches,member)).items).toEqual([expect.objectContaining({opportunityId:target.id,classification:"partial",
      reasons:expect.arrayContaining(["unknown","skillFit","weeklyFit"])})]);
    expect((await check(200,target.scoped+"/candidates",organizer)).items).toEqual([]);
    await check(200,profile,member,{action:"save",expectedVersion:1,...opaque(),...profileInput,
      consent:{...profileInput.consent,discovery:true}});
    const select = async (scope: string) => {
      const found = await check(200,scope+"/candidates",organizer);
      expect(found.items).toEqual([expect.objectContaining({handle:member.handle,selection:expect.any(String)})]);
      return found.items[0].selection as string;
    };
    const firstSelection = await select(target.scoped);
    await check(403,target.scoped+"/recruitment/preview",organizer,{selection:firstSelection},"POST");
    await check(200,inbox+"/preferences",member,{allowed:true,expectedVersion:0,...opaque()});
    expect(await check(200,target.scoped+"/recruitment/preview",organizer,{selection:firstSelection},"POST")).toMatchObject({revision:2});
    const invite = async (scope: string, selection: string) => check(200,scope+"/recruitment",organizer,{
      selection,expectedVersion:0,...opaque(),message:"Invitation to apply for a disposable reading opportunity.",
    },"POST");
    const first = await invite(target.scoped,firstSelection);
    expect((await check(200,"/api/v1/me/notifications",member)).notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:"volunteer_recruitment",recruitment:{id:first.id,status:"pending"}})]));
    await check(403,inbox+"/"+first.id,other);
    await login(page,member);
    for (const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      const width = locale==="en"?1440:390;
      await page.setViewportSize({width,height:900});
      await page.goto("/settings/volunteering/invitations/"+first.id);
      await expect(page.getByRole("heading",{name:"Practice reading group"})).toBeVisible();
      expect(await page.locator("body").evaluate(body=>body.scrollWidth)).toBeLessThanOrEqual(width);
    }
    const [app,duplicate] = await Promise.all([
      native(member,"volunteer_apply",{id:target.id}),
      check(200,work,member,{action:"volunteer_apply",id:target.id},"POST",undefined,"http://127.0.0.1:5301"),
    ]);
    expect(app.id).toBe(duplicate.id);
    await native(organizer,"volunteer_offer",{id:app.id,reason:"Offer the synthetic practice assignment."});
    await native(member,"volunteer_confirm",{id:app.id});
    const task = await native(organizer,"task_create",{title:"Prepare reading cards",description:"Prepare a set of synthetic reading cards.",
      priority:"normal",sensitive:false,dueOn:null});
    await native(organizer,"task_assign",{id:task.id,version:1,userId:member.id});
    await native(member,"task_accept",{id:task.id,version:2});
    await native(member,"task_submit",{id:task.id,version:3});
    expect((await check(200,inbox+"/"+first.id,member)).status).toBe("application_initiated");

    const second = await opportunity();
    const secondSelection = await select(second.scoped);
    const pending = await invite(second.scoped,secondSelection);
    await check(200,profile,other,{action:"save",expectedVersion:0,...opaque(),...profileInput,
      consent:{...profileInput.consent,discovery:true}});
    await check(200,inbox+"/preferences",other,{allowed:true,expectedVersion:0,...opaque()});
    const concurrent = await opportunity();
    const pageDuringRace = await check(200,concurrent.scoped+"/candidates",organizer);
    const prospect = pageDuringRace.items.find((item:{handle:string}) => item.handle===other.handle);
    expect(prospect?.selection).toEqual(expect.any(String));
    const parallelStart = performance.now();
    const raced = await Promise.all([
      call(concurrent.scoped+"/recruitment",organizer,{selection:prospect.selection,expectedVersion:0,...opaque(),message:"Disposable concurrent application rehearsal."},"POST",undefined,"http://127.0.0.1:5301"),
      call(inbox+"/preferences",other,{allowed:false,expectedVersion:1,...opaque()}),
      call(work,other,{action:"volunteer_apply",id:concurrent.id},"POST"),
      call(concurrent.scoped+"/candidates",organizer),
      call(matches,member),
      call(inbox,member),
    ]);
    expect([200,403]).toContain(raced[0].status);
    expect(raced.slice(1).map(result => result.status)).toEqual([200,200,200,200,200]);
    expect(sql(`select count(*) from private.c34_invitations where recipient='${other.id}' and opportunity='${concurrent.id}' and status='pending';`)).toBe("0");
    console.log("C3 mixed workload "+JSON.stringify({ ms:Math.round(performance.now()-parallelStart),statuses:raced.map(result=>result.status) }));
    await change("matching","pause");
    expect(await check(200,matches,member)).toMatchObject({state:"closed",items:[]});
    expect((await read()).stages.find((stage:{capability:string})=>stage.capability==="discovery").status).toBe("active");
    expect((await check(200,inbox+"/"+pending.id,member)).status).toBe("pending");
    await change("intake","pause");
    const pausedView = await read();
    expect(pausedView.stages.filter((s:{status:string})=>s.status==="paused")).toHaveLength(4);
    expect(await check(200,profile,member)).toMatchObject({intake:false,profile:{version:2}});
    await check(403,profile,member,{action:"save",expectedVersion:2,...opaque(),...profileInput});
    await check(200,profile,member,{action:"withdraw",expectedVersion:2,...opaque(),consentKey:"discovery"});
    await check(200,profile,member,{action:"withdraw",expectedVersion:3,...opaque(),consentKey:"matching"});
    await check(200,inbox+"/preferences",member,{allowed:false,expectedVersion:1,...opaque()});
    expect(await check(200,inbox+"/"+pending.id,member)).toMatchObject({status:"invalidated",terms:null,message:null});
    await check(403,inbox+"/preferences",member,{allowed:true,expectedVersion:2,...opaque()});
    await change("requirements","pause");
    const frozen = await check(200,work+"/requirements",organizer);
    expect(frozen.items).toEqual(expect.arrayContaining([expect.objectContaining({opportunityId:target.id,editable:false,published:expect.objectContaining({version:2})})]));
    await check(403,target.scoped,organizer,{action:"draft",expectedVersion:2,...opaque(),requirements});
    await change("intake","resume");
    await change("discovery","resume",403);
    await change("requirements","resume");
    await change("discovery","resume");
    expect((await read()).stages.find((stage:{capability:string})=>stage.capability==="recruitment").status).toBe("paused");
    await change("recruitment","resume");
    expect(await check(200,inbox+"/"+pending.id,member)).toMatchObject({status:"invalidated"});
    await change("all","emergency_pause");
    expect((await read()).stages.every((stage:{status:string})=>stage.status==="paused")).toBe(true);
    expect((await check(200,work,member)).tasks).toEqual(expect.arrayContaining([expect.objectContaining({id:task.id,status:"submitted"})]));
    expect(sql(`select exists(select from private.project_team where project_id='${project}' and user_id='${member.id}' and revoked_at is null)
      and exists(select from private.project_applications where id='${app.id}' and status='accepted');`)).toBe("t");

    const exported = JSON.parse(sql(`select private.privacy_export_projection('${member.id}')::text;`));
    expect(exported.volunteering).toMatchObject({profile:{summary:profileInput.summary},contact:{allowed:false}});
    expect(JSON.stringify(exported.volunteering)).not.toContain("Invitation to apply");
    expect(JSON.parse(sql(`select private.lifecycle_inventory('${member.id}')::text;`)).dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:"protected_evidence",disposition:"preserve"})]));

    recover();
  } finally {
    sql(`delete from private.c35_stage; delete from private.c35_fixture; delete from private.c35_events;
      delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});

test("closed Founder activation panel is available in all supported languages", async ({ browser,makeMember }) => {
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  const key = await enroll(founder);
  const founderContext = await browser.newContext({ baseURL:web, viewport:{width:1440,height:900} });
  try {
    await founderContext.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    const founderPage = await founderContext.newPage();
    await login(founderPage,founder);
    await solveMfa(founderPage,key);
    await founderPage.goto(web+"/admin?section=volunteerSettings");
    await founderPage.getByRole("button",{name:"Open administration",exact:true}).click();
    for (const locale of ["en","ht","fr","es"] as const) {
      const t = activationCopy(locale);
      if (locale !== "en") {
        await founderContext.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
        await founderPage.setViewportSize({width:390,height:900});
        await founderPage.reload();
      }
      const heading = founderPage.getByRole("heading",{name:t("title"),exact:true});
      await expect(heading).toBeVisible();
      const panel = founderPage.locator("section").filter({ has:heading }).last();
      await expect(panel.getByText(t("incomplete"),{exact:true})).toHaveCount(5);
      for (const stage of ["intake","requirements","matching","discovery","recruitment","skills"] as const)
        await expect(panel.getByRole("heading",{name:t(stage),exact:true})).toBeVisible();
      for (const button of await panel.getByRole("button",{name:t("enable"),exact:true}).all())
        await expect(button).toBeDisabled();
      await expect(panel.getByRole("button",{name:t("enable"),exact:true})).toHaveCount(5);
      await expect(panel.getByRole("button",{name:t("emergency_pause"),exact:true})).toBeDisabled();
      await expect(panel.getByRole("heading",{name:t("history"),exact:true})).toBeVisible();
      expect(await panel.evaluate(element=>element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (locale === "en") {
        const theme = founderPage.getByRole("button",{name:"Switch to dark theme",exact:true});
        await theme.focus();
        await theme.press("Enter");
        await expect(founderPage.getByRole("button",{name:"Switch to light theme",exact:true})).toBeVisible();
        await expect(heading).toBeVisible();
      }
    }

    await founderContext.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    const route = "**/api/v1/admin/volunteer-settings/activation";
    await founderPage.route(route, async intercepted => {
      if (intercepted.request().method() === "GET") await intercepted.abort("failed");
      else await intercepted.continue();
    });
    await founderPage.reload();
    const heading = founderPage.getByRole("heading",{name:"Volunteer activation controls",exact:true});
    const panel = founderPage.locator("section").filter({has:heading}).last();
    const retry = panel.getByRole("button",{name:"Try again",exact:true});
    await expect(retry).toBeVisible();
    await founderPage.unroute(route);
    sql("insert into private.c35_fixture values(true,true,true,true);");
    await retry.press("Enter");
    const intake = panel.getByRole("listitem").filter({has:founderPage.getByRole("heading",{name:"Volunteer profile intake",exact:true})});
    const disclosure = intake.locator("summary");
    await expect(disclosure).toHaveText("Enable");
    await disclosure.press("Enter");
    const reason = "Disposable keyboard activation verification.";
    await intake.locator("textarea").fill(reason);
    const confirmation = intake.getByRole("checkbox");
    await expect(confirmation).not.toBeChecked();
    await confirmation.press("Space");
    await expect(confirmation).toBeChecked();
    await intake.locator("form").getByRole("button",{name:"Enable",exact:true}).press("Enter");
    await expect(intake.getByText("Active",{exact:true})).toBeVisible();
    await expect(panel.getByText(reason,{exact:true})).toBeVisible();
  } finally {
    await founderContext.close();
    sql(`delete from private.c35_stage; delete from private.c35_events; delete from private.c35_fixture;
      delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});
