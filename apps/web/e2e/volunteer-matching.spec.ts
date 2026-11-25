import { randomUUID } from "node:crypto";
import { api, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, sql, test, totp, web, type Member } from "./fixtures";

import { matchingCopy } from "../src/lib/matching-i18n";

const ownerPath = "/api/v1/me/volunteer-matches";
const adminPath = "/api/v1/admin/volunteer-settings/matching";
const opportunityPath = (project: string, opportunity: string) => "/api/v1/projects/" + project + "/work/requirements/" + opportunity;
const terms = { mode:"remote", hoursPerWeek:4, durationWeeks:2, beginnerFriendly:false, screening:false,
  skills:[{ code:"literacy_tutoring",priority:"required",proficiency:"intermediate",experienceMin:1,experienceMax:null }],
  languages:[{ code:"ht",priority:"required",proficiency:"intermediate" }] };
const gates = "insert into private.c31_fixture values(true); insert into private.c32_fixture values(true); insert into private.c33_fixture values(true);";
const close = "delete from private.c33_fixture; delete from private.c32_fixture; delete from private.c31_fixture;";

async function request(path: string, status: number | number[], member?: Member, body?: object, method?: string, workspace?: string) {
  const response = await fetch(api + path,{ method:method??(body?"PATCH":"GET"), signal:AbortSignal.timeout(10_000),
    headers:{ ...(member?{Authorization:"Bearer "+member.token}:{}), ...(body?{"Content-Type":"application/json"}:{}),
      ...(workspace?{"X-Ayinou-Workspace":workspace}:{}) }, ...(body?{body:JSON.stringify(body)}:{}) });
  const data = await response.json();
  expect([status].flat(),path+" "+JSON.stringify(data)).toContain(response.status);
  return data;
}

function seedOwner(organizer: Member, reviewer: Member) {
  [organizer,reviewer].forEach(finishPersonalOnboarding);
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values('${organizer.id}','identity','verified','review','${reviewer.id}',now());
    update public.profiles set is_visible=true where user_id='${organizer.id}';
    insert into public.user_settings(user_id,discoverable) values('${organizer.id}',true)
      on conflict(user_id) do update set discoverable=true;`);
}

function opportunity(organizer: Member, department = "HT-OU", criteria = terms) {
  const project = randomUUID(), id = randomUUID();
  sql(`insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,
    submitted_by,submitted_at,approved_at,directory_published_at) values('${project}','${organizer.id}','${organizer.id}',
      gen_random_uuid(),'c33','approved','${organizer.id}',now(),now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${organizer.id}',jsonb_build_object('title','Learning space','country','HT','department','${department}','category','education','publishRequested',true));
    insert into private.project_execution(project_id,approved_revision,status,operator_id) values('${project}',1,'active','${organizer.id}');
    insert into private.project_opportunities(id,project_id,manager_id,title,description,skills,commitment,remote,capacity,closes_on)
      values('${id}','${project}','${organizer.id}','Reading opportunity','Support the rehearsal reading sessions.','Reading','Four hours',${criteria.mode!=="on_site"},1,current_date+14);
    insert into private.c32_requirements(project,opportunity,version,action,snapshot,actor,request,fingerprint)
      values('${project}','${id}',1,'publish',private.c32_snapshot('${JSON.stringify(criteria)}',private.c32_settings(),1,
        '${department}',1,current_date+14,${criteria.mode!=="on_site"}),'${organizer.id}',gen_random_uuid(),'c33');`);
  return { project, id, path:opportunityPath(project,id) };
}

function profile(member: Member, matching: boolean, discovery: boolean, display = false) {
  finishPersonalOnboarding(member);
  sql(`insert into private.c31_profiles values('${member.id}',1,'Private volunteer summary',
      '[{"code":"ht","proficiency":"advanced"}]','hybrid','four_eight','{}',true,'available',current_date+40);
    insert into private.c31_selections values('${member.id}','literacy_tutoring','advanced',4);
    insert into private.c31_consents(actor,matching,discovery,profile_display) values('${member.id}',${matching},${discovery},${display});`);
}

test("matching reads current consent and returns only scoped native opportunities and minimum organizer projections", async ({ page,context,signedIn,makeMember }) => {
  test.setTimeout(135_000);
  const organizer = signedIn, member = await makeMember({visible:true}), candidate = await makeMember({visible:true}),
    outsider = await makeMember({visible:true});
  seedOwner(organizer,member);
  profile(member,true,false);
  profile(candidate,false,true);
  profile(outsider,false,false,true);
  sql(`update public.member_private set membership_category='international_supporter' where user_id='${member.id}';`);
  const target = opportunity(organizer);
  const physical = opportunity(organizer,"HT-CE",{ ...terms,mode:"on_site" });
  const screened = opportunity(organizer,"HT-AR",{ ...terms,screening:true });
  expect(await request(ownerPath,200,member)).toMatchObject({state:"closed",items:[]});
  expect(await request(target.path+"/candidates",200,organizer)).toMatchObject({state:"closed",items:[]});
  await request(adminPath,403,member);
  await request(ownerPath,401);
  expect(sql(`select not has_function_privilege('anon','public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)','EXECUTE');`)).toBe("t");
  sql(gates);
  try {
    const personal = (department = "HT-OU") => request(ownerPath+"?department="+department,200,member);
    const discover = () => request(target.path+"/candidates",200,organizer);
    const result = await personal();
    expect(result).toMatchObject({state:"ready",items:[{opportunityId:target.id,requirementVersion:1,classification:"strong",
      reasons:expect.arrayContaining(["skillFit","languageFit","modeFit","weeklyFit","departmentFit"])}]});
    expect(JSON.stringify(result)).not.toMatch(/score|Private volunteer summary|experienceMin/);
    expect((await personal("HT-CE")).items[0].opportunityId).toBe(physical.id);
    expect((await personal("HT-AR")).items[0]).toMatchObject({opportunityId:screened.id,classification:"additional",reasons:expect.arrayContaining(["screening"])});
    expect((await request(screened.path+"/candidates",200,organizer)).items).toEqual([]);
    expect((await request(ownerPath,200,candidate)).state).toBe("unavailable");
    expect((await discover()).items).toEqual([expect.objectContaining({handle:candidate.handle,name:expect.any(String),classification:"strong"})]);
    await request(target.path+"/candidates",403,member);
    await request(opportunityPath(physical.project,target.id)+"/candidates",403,organizer);
    await request(ownerPath+"?minimumAge=18",400,member);
    await inEnglish(context);
    await login(page,member);
    await expect(page).toHaveURL(/dashboard/);
    for (const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      const width = locale==="en" ? 1440 : 390;
      await page.setViewportSize({width,height:900});
      await page.goto("/settings/volunteering/recommendations");
      const copy=matchingCopy(locale);
      await expect(page.getByRole("heading",{name:copy("title"),exact:true})).toBeVisible();
      await expect(page.getByText(copy("strong"),{exact:true}).first()).toBeVisible();
      await expect(page.getByText(copy("screening"),{exact:true})).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(width);
      if (locale==="en") {
        await page.getByRole("link",{name:copy("open"),exact:true}).first().focus();
        await expect(page.getByRole("link",{name:copy("open"),exact:true}).first()).toBeFocused();
        await page.getByRole("button",{name:"Switch to dark theme",exact:true}).click();
        await expect(page.getByText(copy("strong"),{exact:true}).first()).toBeVisible();
        await page.getByRole("button",{name:"Switch to light theme",exact:true}).click();
      }
    }
    await request(target.path+"/candidates?handle="+candidate.handle,400,organizer);
    sql(`insert into feed_data.profile_privacy(user_id,mode) values('${candidate.id}','private') on conflict(user_id) do update set mode='private';`);
    expect((await discover()).items).toEqual([]);
    sql(`update feed_data.profile_privacy set mode='public' where user_id='${candidate.id}';
      insert into feed_data.member_blocks(actor_id,target_id) values('${candidate.id}','${organizer.id}');`);
    expect((await discover()).items).toEqual([]);
    sql(`delete from feed_data.member_blocks where actor_id='${candidate.id}';
      insert into feed_data.member_blocks(actor_id,target_id) values('${organizer.id}','${candidate.id}');`);
    expect((await discover()).items).toEqual([]);
    sql(`delete from feed_data.member_blocks where actor_id='${organizer.id}';
      insert into private.account_restrictions(user_id,status,reason) values('${candidate.id}','suspended','Disposable account standing scenario');`);
    expect((await discover()).items).toEqual([]);
    sql(`delete from private.account_restrictions where user_id='${candidate.id}';
      insert into private.m23_restrictions(subject_id,capability,scope_kind,authority,max_minutes,category,starts_at,expires_at)
        values('${member.id}','volunteer_apply','platform','founder',30,'other',now(),now()+interval '30 minutes');`);
    expect((await personal()).items).toEqual([]);
    sql(`delete from private.m23_restrictions where subject_id='${member.id}';`);
    await request("/api/v1/me/volunteer-profile",200,candidate,{ action:"withdraw",expectedVersion:1,requestId:randomUUID(),consentKey:"discovery" });
    expect((await discover()).items).toEqual([]);
    sql(`update private.c31_selections set experience=null where actor='${member.id}';`);
    expect((await personal()).items[0]).toMatchObject({classification:"partial",reasons:expect.arrayContaining(["unknown"])});
    sql(`update private.c31_selections set proficiency='beginner' where actor='${member.id}';`);
    expect((await personal()).items[0].classification).toBe("additional");
    sql(`update private.c31_selections set proficiency='advanced',experience=4 where actor='${member.id}';`);
    await request(ownerPath,200,member,{action:"pause",expectedVersion:0,requestId:randomUUID()});
    expect(await personal()).toMatchObject({state:"unavailable",paused:true,pauseVersion:1});
    await request(ownerPath,200,member,{action:"resume",expectedVersion:1,requestId:randomUUID()});
    await request(target.path+"/dismiss",200,member,{revision:1},"POST");
    expect((await personal()).items).toEqual([]);
    sql(`delete from private.c33_dismissed where actor='${member.id}';
      update private.c31_profiles set expires_on=current_date-1 where actor='${member.id}';`);
    expect((await personal()).state).toBe("unavailable");
    sql(`update private.c31_profiles set expires_on=current_date+40 where actor='${member.id}';
      update private.c31_skills set status='retired' where code='literacy_tutoring';`);
    expect((await personal()).items).toEqual([]);
    sql("update private.c31_skills set status='active' where code='literacy_tutoring';");
    const applied = await request("/api/v1/projects/"+target.project+"/work",200,member,{action:"volunteer_apply",id:target.id},"POST");
    sql(`update private.c31_consents set matching=true where actor='${candidate.id}';`);
    expect((await request(ownerPath+"?department=HT-OU",200,candidate)).items[0].opportunityId).toBe(target.id);
    await request("/api/v1/projects/"+target.project+"/work",200,organizer,{action:"volunteer_offer",id:applied.id,reason:"Confirm the disposable volunteer offer."},"POST");
    expect((await request(ownerPath+"?department=HT-OU",200,candidate)).items).toEqual([]);
    await request("/api/v1/projects/"+target.project+"/work",200,organizer,{action:"opportunity_close",id:target.id},"POST");
    expect((await personal()).items).toEqual([]);
    await request("/api/v1/me/volunteer-profile",200,member,{ action:"withdraw",expectedVersion:1,requestId:randomUUID(),consentKey:"matching" });
    expect((await personal()).state).toBe("unavailable");
    expect(sql(`select count(*) from private.project_applications where applicant_id='${member.id}' and opportunity_id='${target.id}';`)).toBe("1");
  } finally { sql(close); }
});

test("Founder can prepare matching without activation or privacy overrides", async ({ signedIn,makeMember }) => {
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const key = await enroll(founder);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await client.auth.signInWithPassword({email:founder.email,password:founder.password})).error).toBeNull();
    const factor = (await client.auth.mfa.listFactors()).data!.totp[0];
    const mfa = await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(key)});
    const staff = { ...founder,token:mfa.data!.access_token };
    const workspace = (await request("/api/v1/me/private-workflows",200,staff,{kind:"admin_workspace"},"POST")).id;
    await request(adminPath,403,signedIn,undefined,undefined,workspace);
    await request(adminPath,403,staff,undefined,undefined,randomUUID());
    const initial = await request(adminPath,200,staff,undefined,undefined,workspace);
    expect(initial.settings.departments).toHaveLength(10);
    const body = { ...initial.settings, action:"configure",version:undefined,expectedVersion:0,requestId:randomUUID(),
      reason:"Prepare nationwide matching preferences without activation.",confirmed:true,requiredWeight:8 };
    await request(adminPath,400,staff,{...body,requireConsent:false},undefined,workspace);
    await request(adminPath,400,staff,{...body,enabled:true},undefined,workspace);
    expect(await request(adminPath,200,staff,body,undefined,workspace)).toEqual({version:1});
    expect(await request(adminPath,200,staff,body,undefined,workspace)).toEqual({version:1});
    await request(adminPath,409,staff,{...body,requestId:randomUUID()},undefined,workspace);
    expect(await request(ownerPath,200,staff)).toMatchObject({state:"closed"});
  } finally { sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`); }
});

test("bounded matching performance at 1000, 10000 and 50000 disposable profiles", async ({ signedIn, makeMember }) => {
  test.setTimeout(240_000);
  const organizer = signedIn, member = await makeMember({visible:true});
  seedOwner(organizer,member);
  profile(member,true,false);
  sql(`delete from private.c33_configuration;
    begin;
    create temporary table c33_opportunities(project uuid,id uuid,department text,n int) on commit drop;
    insert into c33_opportunities
      select gen_random_uuid(),gen_random_uuid(),c.department_code,n from feed_data.communities c
      cross join generate_series(1,12) n where c.kind='department';
    insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,
      submitted_by,submitted_at,approved_at,directory_published_at)
      select project,'${organizer.id}','${organizer.id}',gen_random_uuid(),'scale','approved','${organizer.id}',now(),now(),now() from c33_opportunities;
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      select project,1,'${organizer.id}',jsonb_build_object('title','Synthetic opportunity','country','HT','department',department,'category','education')
      from c33_opportunities;
    insert into private.project_execution(project_id,approved_revision,status,operator_id)
      select project,1,'active','${organizer.id}' from c33_opportunities;
    insert into private.project_opportunities(id,project_id,manager_id,title,description,skills,commitment,remote,capacity,closes_on,closed_at)
      select id,project,'${organizer.id}','Reading opportunity','Synthetic availability rehearsal.','Reading','Four hours',true,2,
        case when n%6=0 then current_date-1 else current_date+14 end,case when n%9=0 then now() end from c33_opportunities;
    insert into private.c32_requirements(project,opportunity,version,action,snapshot,actor,request,fingerprint)
      select project,id,1,'publish',private.c32_snapshot('${JSON.stringify(terms)}',private.c32_settings(),1,
        department,2,case when n%6=0 then current_date-1 else current_date+14 end,true),
        '${organizer.id}',gen_random_uuid(),'scale' from c33_opportunities;
    commit;`);
  const target = opportunity(organizer);
  const discover = target.path+"/candidates";
  const actorPrefix = "33000000-0000-4000-8000-";
  let start = 1;
  sql(gates);
  try {
    for (const population of [1000,10000,50000]) {
      while (start<=population) {
        const end = Math.min(start+1999,population);
        sql(`begin;
          create temporary table c33_batch(id uuid,n int) on commit drop;
          insert into c33_batch select ('${actorPrefix}'||lpad(g::text,12,'0'))::uuid,g from generate_series(${start},${end}) g;
          insert into auth.users(id,email,email_confirmed_at,invited_at,raw_user_meta_data)
            select id,'scale'||n||'@matching.example.invalid',now(),now(),'{"signup_path":"organization"}' from c33_batch;
          insert into public.profiles(user_id,username,display_name,is_visible)
            select id,'scale_c33_'||n,'Synthetic volunteer',n%5<>0 from c33_batch
            on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,is_visible=excluded.is_visible;
          insert into public.user_settings(user_id,discoverable) select id,n%7<>0 from c33_batch
            on conflict(user_id) do update set discoverable=excluded.discoverable;
          insert into private.c31_profiles select id,1,'','[{"code":"ht","proficiency":"advanced"}]',
            case when n%3=0 then 'on_site' else 'hybrid' end,'four_eight','{}',true,
            case when n%8=0 then 'paused' else 'available' end,current_date+case when n%6=0 then -1 else 45 end from c33_batch;
          insert into private.c31_consents(actor,matching,discovery,profile_display) select id,n%5<>0,n%4<>0,false from c33_batch;
          insert into private.c31_selections select id,'literacy_tutoring',case when n%9=0 then 'beginner' else 'advanced' end,3 from c33_batch;
          commit;`);
        start=end+1;
      }
      sql("analyze private.c31_consents; analyze private.c31_profiles; analyze private.c32_requirements;");
      const samples: Record<string,{ ms:number; bytes:number }[]> = { recommendation:[],discovery:[] };
      for (const [label,path,account] of [["recommendation",ownerPath,member],["discovery",discover,organizer]] as const) {
        for (let trial=0; trial<3; trial++) {
          const started=performance.now();
          const result=await request(path,200,account);
          samples[label].push({ ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(JSON.stringify(result)) });
          expect(result.state).toBe("ready");
          expect(result.items.length).toBeGreaterThan(0);
          if (label==="discovery") expect(result.items.length).toBeLessThanOrEqual(6);
        }
      }
      if (population===1000) {
        const firstPage = await request(ownerPath,200,member);
        expect(typeof firstPage.nextCursor).toBe("string");
        const continuation = "?cursor=" + encodeURIComponent(firstPage.nextCursor);
        const following = await request(ownerPath+continuation,200,member);
        expect(following.items.every((row: {opportunityId:string}) =>
          !firstPage.items.some((item: {opportunityId:string}) => item.opportunityId===row.opportunityId))).toBe(true);
        await request(ownerPath+continuation+"&mode=remote",400,member);
        await request(ownerPath+continuation,400,organizer);
        expect(sql("select count(distinct snapshot->>'department') from private.c32_requirements where action='publish';")).toBe("10");
      }
      const cohort=sql("explain (analyze,buffers,costs off) select actor from private.c31_consents where discovery order by actor limit 96;");
      const publications=sql("explain (analyze,buffers,costs off) select distinct on (opportunity) opportunity,version from private.c32_requirements where action='publish' order by opportunity,version desc limit 97;");
      const db=sql(`explain (analyze,buffers,costs off) select public.c33_matching_for_api('${organizer.id}',
        (select id from auth.sessions where user_id='${organizer.id}' and aal='aal1' order by created_at desc limit 1),false,null,null,true,
        '${target.project}','${target.id}',null,'discover','{}');`);
      const planSummary = (plan: string) => plan.split(/\r?\n/).filter((line) => /Execution Time|Index |Limit|Buffers/.test(line));
      console.log("C3.3 benchmark "+JSON.stringify({population,structuredOpportunities:121,samples,
        plans:{cohort:planSummary(cohort),publications:planSummary(publications),discoveryRpc:planSummary(db)}}));
    }
  } finally { sql(close); }
});
