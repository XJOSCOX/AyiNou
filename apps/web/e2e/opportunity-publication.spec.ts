import { randomUUID } from "node:crypto";
import { opportunityReviewChecks, volunteerDepartments } from "@ayinou/shared";
import { publicationCopy } from "../src/lib/opportunity-publication-i18n";
import { api, enroll, expect, finishPersonalOnboarding, localClient, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";

const workspace="/api/v1/opportunity-publication/workspace";
const publicRoot="/api/v1/opportunity-publication/public/";
const draftRoot=(org:string)=>"/api/v1/institutions/"+org+"/opportunities";
const request=()=>({requestId:randomUUID()});
const acknowledged={confirmed:true,reason:"Disposable independent review and governance evidence."};
const begins="2027-02-03T13:00:00Z", ends="2027-02-03T15:00:00Z";
const base={title:"Synthetic learning opportunity",description:"Practice only, using isolated disposable records.",
  type:"workshop",language:"ht",category:"educational",country:"HT",department:"HT-OU",mode:"remote",opensOn:null,
  closesOn:"2027-02-02",skills:["literacy_tutoring"],references:[],applicationMethod:"expression_of_interest",
  details:{topic:"Reading practice",learningObjectives:"Prepare reusable reading activities.",startsAt:begins,endsAt:ends,format:"remote",capacity:12}};
const details={
  employment:{employmentType:"part_time",responsibilities:"Prepare learning activities.",compensation:{state:"range",min:800,max:1200,currency:"HTG"},compensationPeriod:"day"},
  internship:{duration:"Four weeks",learningObjectives:"Observe lesson plans.",payment:"unpaid",compensation:{state:"zero"},supervision:"On-site supervisor",startDate:"2027-02-03",endDate:"2027-03-03"},
  scholarship:{sponsor:"Practice college",purpose:"Practice only",academicLevel:"Undergraduate",subject:"Education",funding:"partial",expenses:"Books",eligibility:"Majors in education",deadline:"2027-02-02",awardPeriod:"One term"},
  training:{skillsTaught:["literacy_tutoring"],provider:"Practice college",duration:"One day",format:"remote",payment:"free",cost:{state:"zero"}},
  education:{institution:"Practice college",subject:"Education",academicLevel:"Undergraduate",duration:"One term",admission:"Completed school",tuition:{state:"undisclosed"},format:"remote",deadline:"2027-02-02",enrollmentDeadline:"2027-02-03"},
  apprenticeship:{trade:"Bookbinding",learningObjectives:"Learn basic binding.",practicalExperience:"Guided workshop.",supervision:"Assigned instructor",duration:"Four weeks",payment:"paid",compensation:{state:"unknown"},safeguarding:"Adults only under instructor supervision."},
};
async function call(path:string, member:Member|undefined, status:number, method="GET", body?:object, privateWorkspace?:string, origin=api) {
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(12_000),
    headers:{...(member?{Authorization:"Bearer "+member.token}:{}),...(body?{"Content-Type":"application/json"}:{}),
      ...(privateWorkspace?{"X-Ayinou-Workspace":privateWorkspace}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();
  expect(response.status, path+" "+JSON.stringify(value)).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return value;
}
async function staffSession(member:Member,kind:string) {
  const secret=await enroll(member);
  const auth=localClient("AYINOU_E2E_SUPABASE_PUBLIC").auth;
  expect((await auth.signInWithPassword({email:member.email,password:member.password})).error).toBeNull();
  const factor=(await auth.mfa.listFactors()).data!.totp[0];
  const confirmed=await auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(secret)});
  expect(confirmed.error).toBeNull();
  const trusted={...member,token:confirmed.data!.access_token};
  const response=await fetch(api+"/api/v1/me/private-workflows",{method:"POST",
    headers:{Authorization:"Bearer "+trusted.token,"Content-Type":"application/json"},body:JSON.stringify({kind})});
  expect(response.status).toBe(200);
  return {member:trusted,workspace:(await response.json()).id as string,secret};
}
function org(owner:Member,verified:boolean) {
  const id=randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by,verification_status)
    values('${id}','c42-${id.slice(0,8)}','Synthetic opportunity organization','education','HT','${owner.id}','${verified?"verified":"unverified"}');
    insert into private.organization_memberships(organization_id,user_id,role) values('${id}','${owner.id}','owner');
    ${verified?`insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${owner.id}','${id}','organization','approved',now());`:""}`);
  return id;
}

test("C4.2 Founder preparation renders in four languages while live operations are closed",async({page,context,makeMember})=>{
  const founder=await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason) values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable founder');`);
  try {
    const secret=await enroll(founder);
    await context.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    await login(page,founder);
    await solveMfa(page,secret);
    await page.goto("/admin?section=opportunitySettings");
    await page.getByRole("button",{name:"Open administration",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Publication preparation",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Switch to dark theme",exact:true}).press("Enter");
    await expect(page.getByRole("button",{name:"Switch to light theme",exact:true})).toBeVisible();
    for (const locale of ["en","ht","fr","es"] as const) {
      const width=locale==="en"?1440:390;
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.setViewportSize({width,height:900});
      await page.reload();
      const t=publicationCopy(locale);
      await expect(page.getByRole("heading",{name:t("settings"),exact:true})).toBeVisible();
      await expect(page.getByText(t("readiness"),{exact:true})).toBeVisible();
      expect(await page.locator("body").evaluate(body=>body.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.goto("/settings/opportunities");
    const spanish=publicationCopy("es");
    await expect(page.getByRole("heading",{name:spanish("myInterest"),exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:"Configuración de la cuenta",exact:true})).toHaveAttribute("href","/settings");
    await expect(page.getByRole("status").filter({hasText:spanish("noInterest")})).toBeVisible();
    expect(await page.locator("body").evaluate(body=>body.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { sql("delete from private.platform_bootstrap;"); }
});

test("C4.2 binds independent review, destination and consent to exact revisions",async({signedIn,makeMember})=>{
  test.setTimeout(130000);
  const owner=signedIn, founder=await makeMember(), reviewer=await makeMember(), challenger=await makeMember(),
    applicant=await makeMember({visible:true}), other=await makeMember();
  for (const member of [owner,founder,reviewer,challenger,applicant,other]) finishPersonalOnboarding(member);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason) values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable founder');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values
      ${[owner,reviewer,challenger,other].map(m=>`('${m.id}','identity','verified','review','${founder.id}',now())`).join(",")};
    insert into public.role_assignments(user_id,role) values('${reviewer.id}','administrator'),('${challenger.id}','administrator');
    insert into private.verification_reviewers(user_id) values('${reviewer.id}'),('${challenger.id}');`);
  const a=await staffSession(founder,"admin_workspace"), r=await staffSession(reviewer,"verification_workspace"),
    c=await staffSession(challenger,"verification_workspace");
  const organization=org(owner,true), unverified=org(other,false);
  const command=(member:Member,body:object,status=200,scope?:string,origin=api)=>call(workspace,member,status,"POST",body,scope,origin);
  const admin=(body:object,status=200)=>command(a.member,body,status,a.workspace);
  const create=(actor:Member,scope:string,snapshot:object)=>call(draftRoot(scope),actor,200,"POST",{...request(),expectedVersion:0,snapshot});
  const settings=await call(workspace+"?action=settings",a.member,200,"GET",undefined,a.workspace);
  expect(settings).toMatchObject({version:0,live:false,fixture:false});
  await call(workspace+"?action=settings",applicant,403);
  await admin({action:"configure",version:0,...request(),...acknowledged,settings:settings.settings});
  await admin({action:"configure",version:0,...request(),...acknowledged,settings:settings.settings},409);
  expect(await call(publicRoot+organization,undefined,200)).toEqual({enabled:false,items:[]});
  expect(sql("select not has_function_privilege('authenticated','public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)','execute') and not has_table_privilege('service_role','private.c42_interest','select');")).toBe("t");
  sql("insert into private.c41_fixture values(true); insert into private.c42_fixture values(true);");
  try {
    const grant=async(member:Member,country="HT",department:string|null="HT-OU")=>
      (await admin({action:"appoint",...request(),...acknowledged,reviewer:member.id,country,department,
        expiresAt:new Date(Date.now()+86400000*5).toISOString()})).grant as string;
    const reviewGrant=await grant(reviewer), challengeGrant=await grant(challenger), foreignGrant=await grant(reviewer,"CA",null);
    const unowned=await create(other,unverified,base);
    await command(other,{action:"submit",...request(),confirmed:true,organization:unverified,opportunity:unowned.id,version:1},403);
    const draft=await create(owner,organization,base);
    const target={organization,opportunity:draft.id,version:draft.version};
    await command(owner,{action:"publish",...target,...request(),confirmed:true},403);
    const submit=(target:object,ownership?:string)=>command(owner,{action:"submit",...target,...request(),confirmed:true,ownership});
    await submit(target);
    const assignment={action:"assign",...request(),...acknowledged,opportunity:draft.id,version:1,grant:reviewGrant};
    await admin({...assignment,grant:foreignGrant},403);
    sql(`insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${reviewer.id}','viewer');`);
    await admin(assignment,403);
    sql(`delete from private.organization_memberships where organization_id='${organization}' and user_id='${reviewer.id}';`);
    await admin(assignment);
    const decision=(actor:typeof r,result:string,opportunity=draft.id,status=200,version=1)=>
      command(actor.member,{action:"decide",opportunity,version,...request(),...acknowledged,decision:result,
        checks:[...opportunityReviewChecks]},status,actor.workspace);
    await decision(c,"approved",draft.id,403);
    await decision(r,"changes_requested");
    await command(owner,{action:"challenge",...target,...request(),...acknowledged});
    await admin({...assignment,...request()},403);
    await admin({...assignment,...request(),grant:challengeGrant});
    await decision(c,"approved");
    const publish={action:"publish",...target,...request(),confirmed:true};
    const [published, repeatedPublication]=await Promise.all([
      command(owner,publish),command(owner,publish,200,undefined,"http://127.0.0.1:5301"),
    ]);
    expect(published).toEqual(repeatedPublication);
    const publicData=await call(publicRoot+organization,undefined,200);
    expect(publicData.items).toHaveLength(1);
    expect(publicData.items[0]).toMatchObject({id:draft.id,version:1,methods:{interest:true}});
    expect(publicData.items[0].snapshot).not.toHaveProperty("references");
    const preview=await call(workspace+"?action=interest_preview&organization="+organization+"&opportunity="+draft.id,applicant,200);
    const expression={action:"express",...target,...request(),identity:preview.identity,statement:"I would like more information about the training.",consent:true,adult:true};
    await command(applicant,{...expression,adult:false},400);
    const [interest,repeatedInterest]=await Promise.all([
      command(applicant,expression),command(applicant,expression,200,undefined,"http://127.0.0.1:5301"),
    ]);
    expect(repeatedInterest).toEqual(interest);
    const inbox=workspace+"?action=organization_interest&organization="+organization+"&opportunity="+draft.id;
    await call(inbox,other,403);
    expect((await call(inbox,owner,200)).items).toEqual([expect.objectContaining({id:interest.id,shared_identity:preview.identity})]);
    await command(owner,{action:"interest_state",organization,opportunity:draft.id,interest:interest.id,version:1,state:"acknowledged",...request()});
    expect(sql(`select count(*) from feed_data.notifications where kind='opportunity_interest' and recipient_id='${applicant.id}';`)).toBe("1");
    sql(`insert into feed_data.member_blocks(actor_id,target_id) values('${applicant.id}','${owner.id}');`);
    expect((await call(inbox,owner,200)).items).toEqual([]);
    await command(applicant,{action:"interest_withdraw",...request(),interest:interest.id,version:2});
    expect(sql(`select shared_identity is null and statement is null from private.c42_interest where id='${interest.id}';`)).toBe("t");
    sql(`delete from feed_data.member_blocks where actor_id='${applicant.id}' and target_id='${owner.id}';`);
    await command(applicant,{action:"report",...target,...request(),category:"fraud",reason:"Synthetic opportunity report for the moderation test."});
    expect((await call(workspace+"?action=reports",a.member,200,"GET",undefined,a.workspace)).items).toHaveLength(1);

    const external=await create(owner,organization,{...base,applicationMethod:"external",references:["https://example.org/apply"]});
    const ext={organization,opportunity:external.id,version:1};
    await submit(ext,"Verified disposable ownership evidence for the exact address.");
    await admin({...assignment,...request(),opportunity:external.id});
    await decision(r,"approved",external.id);
    const publishExternal={action:"publish",...ext,...request(),confirmed:true};
    await command(owner,publishExternal);
    expect(await command(applicant,{action:"destination",...ext,confirmed:true})).toEqual({url:"https://example.org/apply"});
    const amended=await call(draftRoot(organization)+"/"+external.id,owner,200,"PATCH",
      {action:"edit",...request(),expectedVersion:1,snapshot:{...base,applicationMethod:"external",references:["https://example.org/changed"]}});
    expect(amended).toMatchObject({version:2,status:"draft"});
    await command(applicant,{action:"destination",...ext,confirmed:true},403);
    await command(owner,{...publishExternal,...request(),version:2},403);

    for (const [type,typed] of Object.entries(details)) {
      const record=await create(owner,organization,{...base,type,details:typed,applicationMethod:"undecided"});
      await submit({organization,opportunity:record.id,version:1});
    }
    for (const department of volunteerDepartments) {
      const record=await create(owner,organization,{...base,department,mode:"hybrid",details:{...base.details,format:"hybrid"}});
      expect(record.version).toBe(1);
    }
    const event=randomUUID();
    sql(`insert into feed_data.events(id,creator_id,organization_id,request_id,request_hash,title,description,category,format,visibility,status,starts_at,ends_at,time_zone,country,department,language,capacity)
      values('${event}','${owner.id}','${organization}',gen_random_uuid(),decode('44','hex'),'Practice workshop event','Native synthetic workshop','education','online','public','published',
        '${begins}','${ends}','UTC','HT','HT-OU','ht',12);`);
    const association=await create(owner,organization,{...base,applicationMethod:"event_registration",details:{...base.details,eventId:event}});
    const eventTarget={organization,opportunity:association.id,version:1};
    await submit(eventTarget);
    await admin({...assignment,...request(),opportunity:association.id});
    await decision(r,"approved",association.id);
    await command(owner,{action:"publish",...eventTarget,...request(),confirmed:true});
    expect((await call(publicRoot+organization+"?opportunity="+association.id,undefined,200)).items[0].methods.event).toBe(event);
    sql(`update feed_data.events set status='canceled' where id='${event}';`);
    expect((await call(publicRoot+organization+"?opportunity="+association.id,undefined,200)).items[0].methods.event).toBeNull();

    sql(`begin;
      create temporary table c42_bench on commit drop as select gen_random_uuid() id,n from generate_series(1,1000) n;
      insert into private.c41_opportunities(id,organization_id,representative,version,status,created_at)
        select id,'${organization}','${owner.id}',1,case when n<=500 then 'published' else 'submitted' end,now()-interval '2 days' from c42_bench;
      insert into private.c41_revisions(organization_id,opportunity_id,version,status,revised_by,representative,action,snapshot,request_id,fingerprint)
        select '${organization}',b.id,1,'draft','${owner.id}','${owner.id}','create',r.snapshot,gen_random_uuid(),'synthetic-benchmark'
        from c42_bench b cross join private.c41_revisions r where r.opportunity_id='${draft.id}' and r.version=1;
      insert into private.c42_cases(opportunity,revision,submitted_by,state)
        select id,1,'${owner.id}',case when n<=500 then 'approved' else 'submitted' end from c42_bench;
      insert into private.c42_publications(opportunity,revision,organization,responsible,published_by)
        select id,1,'${organization}','${owner.id}','${owner.id}' from c42_bench where n<=500;
      create temporary table c42_people on commit drop as select gen_random_uuid() id,n from generate_series(1,120) n;
      insert into auth.users(id,email,email_confirmed_at,invited_at,raw_user_meta_data)
        select id,'scalec42'||n||'@disposable.example.invalid',now(),now(),'{"signup_path":"organization"}' from c42_people;
      insert into public.profiles(user_id,username,display_name,is_visible)
        select id,'scale_c42_'||n,'Synthetic interest member',true from c42_people
        on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,is_visible=excluded.is_visible;
      insert into public.user_settings(user_id,discoverable) select id,true from c42_people
        on conflict(user_id) do update set discoverable=excluded.discoverable;
      insert into private.c42_interest(opportunity,revision,member,state,shared_identity,statement)
        select '${draft.id}',1,id,'submitted',jsonb_build_object('username','scale_c42_'||n,'displayName','Synthetic interest member'),
          'Disposable performance interest statement.' from c42_people;
      commit;`);
    const performanceReport:Record<string,{ms:number;bytes:number}[]>={};
    for (const [label,url,account,scope] of [
      ["list",publicRoot+organization,undefined,undefined],
      ["queue",workspace+"?action=admin_queue",a.member,a.workspace],
      ["interest",inbox,owner,undefined],
    ] as const) {
      performanceReport[label]=[];
      for (let i=0;i<3;i++) {
        const start=performance.now();
        const result=await call(url,account,200,"GET",undefined,scope);
        expect(result.items).toHaveLength(20);
        performanceReport[label].push({ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(JSON.stringify(result))});
      }
    }
    console.log("C4.2 bounded read benchmark "+JSON.stringify(performanceReport));
    await command(applicant,{action:"report",...eventTarget,...request(),category:"unsafe_destination",reason:"Synthetic unsafe destination report for the moderation review."});
    const reportQueue=await call(workspace+"?action=review_reports",c.member,200,"GET",undefined,c.workspace);
    expect(reportQueue.items, sql(`select jsonb_build_object('item',o.status,'review',c.state,'scope',private.c42_scope(g,r.snapshot),
      'independent',private.c42_independent('${challenger.id}',o,c),'grantReviewer',g.reviewer='${challenger.id}',
      'reports',(select count(*) from private.c42_receipts e where e.opportunity=o.id and e.action='report'),
      'prior',(select count(*) from private.c42_receipts e where e.opportunity=o.id and e.action='decide' and e.actor='${challenger.id}'),
      'blocked',feed_data.blocked_pair('${challenger.id}',o.representative))
      from private.c41_opportunities o join private.c42_cases c on c.opportunity=o.id and c.revision=o.version
      join private.c41_revisions r on r.opportunity_id=o.id and r.version=o.version
      cross join private.c42_reviewers g where o.id='${association.id}' and g.id='${challengeGrant}';`))
      .toEqual(expect.arrayContaining([expect.objectContaining({opportunity:association.id,grant_id:challengeGrant})]));
    await command(c.member,{action:"restrict",opportunity:association.id,version:1,...request(),...acknowledged,grant:challengeGrant},200,c.workspace);
    expect((await call(publicRoot+organization+"?opportunity="+association.id,undefined,200)).items).toEqual([]);
    const expired=await create(owner,organization,{...base,closesOn:"2024-02-02"});
    await command(owner,{action:"submit",organization,opportunity:expired.id,version:1,...request(),confirmed:true},403);
    sql(`update private.organizations set verification_status='revoked' where id='${organization}';
      update private.organizations set verification_status='verified' where id='${organization}';`);
    expect((await call(publicRoot+organization,undefined,200)).items).toEqual([]);

  } finally { sql("delete from private.c42_fixture; delete from private.c41_fixture; delete from private.platform_bootstrap;"); }
});
