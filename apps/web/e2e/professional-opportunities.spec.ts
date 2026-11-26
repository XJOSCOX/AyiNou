import { randomUUID } from "node:crypto";
import { volunteerDepartments } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";
import { opportunityCopy } from "../src/lib/professional-opportunities-i18n";

const admin = "/api/v1/admin/opportunity-settings";
const organizationPath = (id: string) => "/api/v1/institutions/" + id + "/opportunities";
const snapshot = { title:"Practice education workshop", description:"Private synthetic draft for a reading workshop.",
  type:"workshop", language:"ht", category:"educational", country:"HT", department:"HT-OU", mode:"remote",
  opensOn:"2027-02-01", closesOn:"2027-02-12", skills:["literacy_tutoring"],
  references:["https://example.org/workshops"], applicationMethod:"external" };
const command = (data: object = snapshot, expectedVersion = 0) => ({ requestId:randomUUID(), expectedVersion, snapshot:data });
async function send(path: string, member?: Member, method = "GET", body?: object, workspace?: string, origin = api) {
  const response = await fetch(origin + path, { method, signal:AbortSignal.timeout(12_000),
    headers:{ ...(member ? {Authorization:"Bearer " + member.token} : {}),
      ...(body ? {"Content-Type":"application/json"} : {}), ...(workspace ? {"X-Ayinou-Workspace":workspace} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  return { status:response.status, data:await response.json(), headers:response.headers };
}
async function check(status: number, ...args: Parameters<typeof send>) {
  const result = await send(...args);
  expect(result.status, args[0] + " " + JSON.stringify(result.data)).toBe(status);
  return result.data;
}
function identify(...members: Member[]) {
  for (const member of members) finishPersonalOnboarding(member);
  sql("insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values " +
    members.map(member => `('${member.id}','identity','verified','review','${members[0].id}',now())`).join(","));
}
function organization(owner: Member, verified: boolean) {
  const id = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by,verification_status)
    values('${id}','practice-${id.slice(0,8)}','Practice learning organization','education','CA','${owner.id}','${verified ? "verified" : "unverified"}');
    insert into private.organization_memberships(organization_id,user_id,role) values('${id}','${owner.id}','owner');
    ${verified ? `insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${owner.id}','${id}','organization','approved',now());` : ""}`);
  return id;
}

test("private opportunity drafts enforce standing, roles, revisions, geography, and synthetic gates", async ({ page,context,signedIn,makeMember }) => {
  const owner = signedIn, other = await makeMember(), rep = await makeMember(), outsider = await makeMember();
  identify(owner, other, rep);
  finishPersonalOnboarding(outsider);
  const unverified = organization(owner,false), verified = organization(other,true);
  const path = organizationPath(unverified), second = organizationPath(verified), assignment = randomUUID(), role = randomUUID();
  sql(`insert into private.organization_memberships(id,organization_id,user_id,role) values('${assignment}','${unverified}','${rep.id}','editor');
    insert into private.organization_custom_roles(id,organization_id,name,permissions)
      values('${role}','${unverified}','Draft writer',array['opportunities.draft']);
    insert into private.organization_custom_assignments(organization_id,role_id,user_id,representative_id)
      values('${unverified}','${role}','${rep.id}','${assignment}');`);
  const read = await send(path,owner);
  expect(read.status).toBe(200);
  expect(read.headers.get("cache-control")).toContain("no-store");
  expect(read.data).toMatchObject({enabled:false,canCreate:false,verified:false,publisherEligible:false});
  expect(await check(200,second,other)).toMatchObject({verified:true,publisherEligible:true});
  await check(401,path);
  await check(403,path,outsider);
  await check(403,admin,owner);
  await check(403,path,owner,"POST",command());
  expect(sql(`select not has_function_privilege('authenticated','public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)','execute')
    and not has_table_privilege('service_role','private.c41_revisions','select,update')
    and not ('recruitment.manage'=any(private.organization_permission_catalog()));`)).toBe("t");
  sql("insert into private.c41_fixture values(true);");
  try {
    const start = command();
    const draft = await check(200,path,rep,"POST",start);
    const detail = path + "/" + draft.id;
    expect(draft).toMatchObject({version:1,status:"draft"});
    expect(await check(200,path,rep,"POST",start)).toEqual(draft);
    await check(403,detail,rep,"PATCH",{...command(snapshot,1),action:"edit"});
    await check(403,detail,other);
    await check(403,second+"/"+draft.id,other);
    await check(400,detail,owner,"PATCH",{...command(snapshot,1),action:"publish"});
    await check(400,path,owner,"POST",command({...snapshot,type:"unrecognized"}));
    await check(400,path,owner,"POST",command({...snapshot, references:["javascript:alert(1)"]}));
    await check(400,path,owner,"POST",command({...snapshot, references:["https://user:secret@example.org"]}));
    await check(400,path,owner,"POST",command({...snapshot, references:["https://127.0.0.1/"]}));
    await check(400,path,owner,"POST",command({...snapshot, country:"ZZ",department:null}));
    await check(400,path,owner,"POST",command({...snapshot, country:"CA"}));
    await check(400,path,owner,"POST",command({...snapshot, department:"HT-ZZ"}));
    const edits = await Promise.all([
      send(detail,owner,"PATCH",{...command({...snapshot, title:"Revised workshop"},1),action:"edit"}),
      send(detail,owner,"PATCH",{...command({...snapshot, title:"Updated workshop"},1),action:"edit"},undefined,"http://127.0.0.1:5301"),
    ]);
    expect(edits.map(response => response.status).sort()).toEqual([200,409]);
    const frozen = await check(200,detail,owner);
    expect(frozen.history.map((item:{version:number})=>item.version)).toEqual([2,1]);
    expect(frozen.history[1].snapshot).toMatchObject({schemaVersion:1,skills:[{code:"literacy_tutoring",version:1}]});
    sql("update private.c31_skills set status='retired' where code='literacy_tutoring';");
    try {
      await check(400,path,owner,"POST",command());
      expect((await check(200,detail,owner)).history[1].snapshot.skills[0].version).toBe(1);
    } finally { sql("update private.c31_skills set status='active' where code='literacy_tutoring';"); }
    for (const department of volunteerDepartments)
      await check(200,second,other,"POST",command({...snapshot,department, mode:"hybrid"}));
    expect(await check(200,second,other,"POST",command({...snapshot,country:"CA",department:null,mode:"on_site"}))).toMatchObject({version:1});
    sql(`update private.organization_memberships set revoked_at=now() where id='${assignment}';`);
    await check(403,path,rep);
    sql(`update private.organizations set verification_status='revoked' where id='${verified}';`);
    await check(403,second,other);
    sql(`update private.organizations set status='archived' where id='${verified}';`);
    await check(403,second,other);
    const withdraw = {action:"withdraw",requestId:randomUUID(),expectedVersion:2};
    expect(await check(200,detail,owner,"PATCH",withdraw)).toMatchObject({status:"withdrawn",version:3});
    expect(await check(200,detail,owner,"PATCH",withdraw)).toMatchObject({status:"withdrawn",version:3});
    await check(409,detail,owner,"PATCH",{...command(snapshot,3),action:"edit"});

    await context.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    await login(page,owner);
    await page.goto("/institutions/"+unverified+"/opportunities");
    for (const locale of ["en","ht","fr","es"] as const) {
      const t = opportunityCopy(locale);
      const width = locale === "en" ? 1440 : 390;
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.setViewportSize({width,height:900});
      await page.reload();
      await expect(page.getByRole("heading",{name:t("title"),exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:t("newDraft"),exact:true})).toBeVisible();
      await page.getByRole("button",{name:t("newDraft"),exact:true}).press("Enter");
      await expect(page.getByLabel(t("name"),{exact:true})).toBeVisible();
      expect(await page.locator("body").evaluate(body=>body.scrollWidth)).toBeLessThanOrEqual(width);
      if (locale === "en") {
        await page.getByRole("button",{name:"Switch to dark theme",exact:true}).press("Enter");
        await expect(page.getByRole("button",{name:"Switch to light theme",exact:true})).toBeVisible();
      }
    }
    await context.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    await page.reload();
    await page.getByRole("button",{name:"New draft",exact:true}).click();
    await page.getByLabel("Title",{exact:true}).fill("Saved by the rehearsal browser");
    await page.getByLabel("Description",{exact:true}).fill("First paragraph.\nSecond paragraph.");
    await page.getByRole("button",{name:"Save private draft",exact:true}).click();
    await expect(page.getByRole("heading",{name:/Draft preview/})).toBeVisible();
    await expect(page.getByText(/Second paragraph/)).toBeVisible();
  } finally { sql("delete from private.c41_fixture;"); }
});

test("recognized Founder can prepare settings without activating drafts", async ({ page,context,makeMember }) => {
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
    values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const secret = await enroll(founder);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    await client.auth.signInWithPassword({email:founder.email,password:founder.password});
    const factor = (await client.auth.mfa.listFactors()).data!.totp[0];
    const elevated = await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(secret)});
    const staff = {...founder,token:elevated.data!.access_token};
    const workspace = (await check(200,"/api/v1/me/private-workflows",staff,"POST",{kind:"admin_workspace"})).id;
    await check(403,admin,staff,"GET",undefined,randomUUID());
    const panel = await check(200,admin,staff,"GET",undefined,workspace);
    expect(panel).toMatchObject({version:0,live:false});
    const configuration = {requestId:randomUUID(),expectedVersion:0,confirmed:true,reason:"Prepare disposable opportunity policy.",
      settings:{...panel.settings,draftLimit:12}};
    await check(400,admin,staff,"PATCH",{...configuration,activate:true},workspace);
    expect(await check(200,admin,staff,"PATCH",configuration,workspace)).toEqual({version:1});
    expect(await check(200,admin,staff,"PATCH",configuration,workspace)).toEqual({version:1});
    await check(409,admin,staff,"PATCH",{...configuration,requestId:randomUUID()},workspace);
    expect(sql("select not exists(select from private.c41_fixture) and not exists(select from private.c41_opportunities where status<>'draft' and status<>'withdrawn');")).toBe("t");

    await context.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    await login(page,founder);
    await solveMfa(page,secret);
    await page.goto("/admin?section=opportunitySettings");
    await page.getByRole("button",{name:"Open administration",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Opportunity settings",exact:true})).toBeVisible();
    for (const locale of ["en","ht","fr","es"] as const) {
      const t = opportunityCopy(locale);
      const width = locale==="en"?1440:390;
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.setViewportSize({width,height:900});
      await page.reload();
      await expect(page.getByRole("heading",{name:t("settings"),exact:true})).toBeVisible();
      await expect(page.getByText(t("live"),{exact:true})).toBeVisible();
      await expect(page.getByText(configuration.reason,{exact:false})).toBeVisible();
      expect(await page.locator("body").evaluate(body=>body.scrollWidth)).toBeLessThanOrEqual(width);
    }
  } finally { sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`); }
});
