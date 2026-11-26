
import { randomUUID } from "node:crypto";
import { clearActivation, prepareMentorshipActivation, stageControls } from "./opportunity-activation-fixtures";
import { volunteerDepartments } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, rehearseDatabaseRecovery, sql, test, totp, type Member } from "./fixtures";

const member = "/api/v1/me/mentorship";
const path = member + "/coordination";
const secondApi = "http://127.0.0.1:5301";
const moderation = "/api/v1/admin/moderation/mentorship";
const lifecycleTimings: Record<string, number[]> = {};

async function request(url: string, user?: Member, body?: object, method = "POST", origin = api, workspace?: string) {
  const started = performance.now();
  const response = await fetch(origin + url, {
    method: body ? method : "GET",
    headers: { ...(user && {Authorization: "Bearer " + user.token}), ...(body && {"Content-Type": "application/json"}), ...(workspace && {"X-Ayinou-Workspace":workspace}) },
    ...(body && {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(12_000),
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  const data = await response.json();
  const action = body && "action" in body ? String(body.action) : url.includes("/relationships/") ? "relationship_read" : null;
  if (action && response.status===200) (lifecycleTimings[action] ??= []).push(Math.round(performance.now()-started));
  return { status: response.status, data };
}

async function staffWorkspace(member: Member) {
  const secret = await enroll(member);
  const auth = localClient("AYINOU_E2E_SUPABASE_PUBLIC").auth;
  expect((await auth.signInWithPassword({email:member.email,password:member.password})).error).toBeNull();
  const factor = (await auth.mfa.listFactors()).data!.totp[0];
  const proof = (await auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(secret)})).data!;
  const staff = {...member,token:proof.access_token};
  const opened = await request("/api/v1/me/private-workflows",staff,{kind:"admin_workspace"});
  expect(opened.status).toBe(200);
  return { staff, workspace: String(opened.data.id) };
}

const command = <T extends object>(action: string, input: T) => ({ action, requestId: randomUUID(), ...input });
const pref = (role: "mentor" | "mentee") => ({
  topics: ["educational_guidance"], skills: [{ code: "literacy_tutoring", proficiency: role === "mentor" ? "advanced" : "beginner" }],
  languages: [{ code: "ht", proficiency: "advanced" }], mode: role === "mentor" ? "remote" : "hybrid",
  geography: role === "mentor" ? "worldwide_remote" : "haiti_departments",
  departments: role === "mentor" ? [] : volunteerDepartments, countries: [], weeklyHours: 2, sessionMinutes: 30, durationWeeks: 8,
  capacity: role === "mentor" ? 1 : null, expiresOn: null, summary: "PRIVATE_MENTOR_DETAIL",
  goals: "PRIVATE_GOAL", learningObjectives: role === "mentee" ? "PRIVATE_OBJECTIVE" : "", experience: 2,
});
const save = (role: "mentor" | "mentee", expectedVersion = 0, discovery = true, recommendations = true, requests = true) =>
  command("save",{role,expectedVersion,adult:true,participation:true,safeguarding:true,
    consent:{recommendations,discovery,requests},preferences:pref(role)});

test("C4.6 stages full private discovery and request-to-relationship coordination", async ({ signedIn: mentee, makeMember }) => {
  test.setTimeout(210_000);
  const mentor = await makeMember();
  const outsider = await makeMember();
  const second = await makeMember();
  const founder = await makeMember();
  for (const user of [mentor,mentee,outsider,second,founder]) finishPersonalOnboarding(user);
  expect(await request(path)).toMatchObject({status:401});
  expect(await request(path,mentee)).toMatchObject({status:200,data:{state:"closed",items:[]}});
  expect(await request("/api/v1/admin/opportunity-settings/mentorship/coordination",mentee)).toMatchObject({status:403});
  expect(sql("select count(*)=12 and bool_and(relrowsecurity and not has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')) from pg_class where relnamespace='private'::regnamespace and relkind='r' and relname like 'c44_%';")).toBe("t");
  expect(sql("select not has_function_privilege('authenticated','public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','EXECUTE');")).toBe("t");

  sql("insert into private.c43_fixture values(true); insert into private.c44_fixture default values;");
  for (const user of [mentor,mentee,second]) sql(`insert into public.user_settings(user_id,discoverable) values('${user.id}',true)
    on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id='${user.id}';`);
  try {
    sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
      insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
        values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable mentorship activation');`);
    const lead=await staffWorkspace(founder);
    prepareMentorshipActivation(lead.staff,lead.workspace);
    const controls=await stageControls(lead.staff,lead.workspace);
    for (const stage of ["mentorship_intake","mentorship_matching","mentorship_requests","mentorship_coordination"] as const) {
      await controls.command(stage,"enable");
    }
    sql("insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values('" + mentor.id + "','identity','verified','review','" + outsider.id + "',now());");
    for (const [user,role] of [[mentor,"mentor"],[mentee,"mentee"],[second,"mentee"],[mentor,"mentee"]] as const) {
      expect(await request(member,user,save(role), "PATCH")).toMatchObject({status:200});
    }
    const match = await request(path + "/matches?lane=recommendations&role=mentee&language=ht",mentee);
    expect(match).toMatchObject({status:200,data:{state:"available",items:[{role:"mentor",classification:"strong",identityVerified:true,canRequest:true}]}});
    expect(JSON.stringify(match.data)).not.toContain("PRIVATE_");
    const pick: string = match.data.items[0].selection;
    expect(await request(member,second,save("mentee",1,false,true),"PATCH")).toMatchObject({status:200});
    expect(await request(path + "/matches?lane=discovery&role=mentee",second)).toMatchObject({status:200,data:{state:"unavailable"}});
    expect(await request(path + "/matches?lane=recommendations&role=mentee",second)).toMatchObject({
      status:200,data:{items:[{canRequest:false}]},
    });
    expect(await request(member,second,save("mentee",2),"PATCH")).toMatchObject({status:200});
    expect(await request(path, outsider, command("send",{selection:pick,introduction:""}))).toMatchObject({status:403});
    expect(await request(path + "/matches?lane=discovery&role=mentor",mentor)).toMatchObject({status:200,data:{state:"available"}});
    expect(await request(path + "/matches?lane=recommendations&role=mentee&topic=leadership",mentee)).toMatchObject({status:200,data:{items:[]}});
    const send = command("send",{selection:pick,introduction:"Could we practice a reading lesson?"});
    const [sent,replay] = await Promise.all([request(path,mentee,send),request(path,mentee,send,"POST",secondApi)]);
    expect(sent).toMatchObject({status:200,data:{state:"pending",version:1}});
    expect(replay).toEqual(sent);
    const id: string = sent.data.id;
    expect(await request(path + "/requests/" + id,outsider)).toMatchObject({status:403});
    expect(await request(path + "/requests/" + id,mentor)).toMatchObject({status:200,data:{introduction:send.introduction}});
    const notification = await request("/api/v1/me/notifications",mentor);
    expect(notification).toMatchObject({status:200,data:{notifications:expect.arrayContaining([
      expect.objectContaining({kind:"mentorship_notice",actor:null,mentorship:{id,action:"request",relationship:false}}),
    ])}});
    expect(JSON.stringify(notification.data)).not.toContain(send.introduction);
    const accepted = await request(path,mentor,command("accept",{id,expectedVersion:1}));
    expect(accepted).toMatchObject({status:200,data:{state:"accepted"}});
    const rel: string = accepted.data.relationship;
    const detail = path + "/relationships/" + rel;
    expect(await request(detail,outsider)).toMatchObject({status:403});
    expect(await request(detail,mentor)).toMatchObject({status:200,data:{state:"agreement_pending",agreedTerms:null}});
    const terms = {title:"Reading lesson practice",objectives:"Plan a short lesson",expectations:"Use constructive feedback",
      duration:undefined,weeks:8,frequency:1,minutes:30,mode:"remote",topics:["educational_guidance"],free:true,safeguarding:true};
    expect(await request(path,mentee,command("propose_agreement",{id:rel,expectedVersion:1,terms}))).toMatchObject({status:200,data:{version:2}});
    expect(await request(path,mentor,command("confirm_agreement",{id:rel,expectedVersion:2,revision:1,confirmed:true}))).toMatchObject({status:200,data:{state:"agreement_pending",version:3}});
    const secondSelection = await request(path + "/matches?lane=discovery&role=mentee",second);
    expect(secondSelection).toMatchObject({status:200,data:{items:[{canRequest:true}]}});
    const secondRequest = await request(path,second,command("send",{selection:secondSelection.data.items[0].selection,introduction:""}));
    const secondAcceptance = await request(path,mentor,command("accept",{id:secondRequest.data.id,expectedVersion:1}));
    expect(secondAcceptance).toMatchObject({status:200,data:{state:"accepted"}});
    const secondRel: string = secondAcceptance.data.relationship;
    expect(await request(path,second,command("propose_agreement",{id:secondRel,expectedVersion:1,terms}))).toMatchObject({status:200});
    expect(await request(path,mentor,command("confirm_agreement",{id:secondRel,expectedVersion:2,revision:1,confirmed:true}))).toMatchObject({status:200});
    const finishFirst = command("confirm_agreement",{id:rel,expectedVersion:3,revision:1,confirmed:true});
    const [firstResult, secondResult] = await Promise.all([
      request(path,mentee,finishFirst),
      request(path,second,command("confirm_agreement",{id:secondRel,expectedVersion:3,revision:1,confirmed:true}),"POST",secondApi),
    ]);
    expect([firstResult.status,secondResult.status].sort()).toEqual([200,409]);
    expect(sql("select count(*) from private.c44_relationships where state='active';")).toBe("1");
    if (firstResult.status!==200) {
      expect(await request(path,second,command("end",{id:secondRel,expectedVersion:4,confirmed:true}))).toMatchObject({status:200});
      expect(await request(path,mentee,finishFirst)).toMatchObject({status:200,data:{state:"active",version:4}});
    }
    await controls.command("mentorship_requests","pause");
    expect(await request(detail,mentee)).toMatchObject({status:200,data:{state:"active",coordinationPaused:false}});
    expect(await request(path,mentee,command("send",{selection:pick,introduction:""}))).toMatchObject({status:403});
    const objective = await request(path,mentee,command("propose_item",{id:rel,expectedVersion:4,kind:"objective",content:{text:"Prepare a sample lesson"}}));
    expect(objective).toMatchObject({status:200,data:{state:"proposed"}});
    expect(await request(path,mentor,command("agree_item",{id:rel,expectedVersion:4,item:objective.data.id,itemVersion:1}))).toMatchObject({status:200,data:{state:"agreed"}});
    expect(await request(path,mentee,command("propose_item",{id:rel,expectedVersion:4,kind:"progress",objective:objective.data.id,
      content:{text:"I drafted a short reading lesson."}}))).toMatchObject({status:200,data:{state:"recorded"}});
    const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
    const session=await request(path,mentor,command("propose_item",{id:rel,expectedVersion:4,kind:"session",
      content:{localStart:tomorrow+"T15:30", timeZone:"America/Port-au-Prince",minutes:30,topic:"Sample exercises"}}));
    expect(session).toMatchObject({status:200,data:{state:"proposed"}});
    expect(await request(path,mentee,command("agree_item",{id:rel,expectedVersion:4,item:session.data.id,itemVersion:1}))).toMatchObject({status:200,data:{state:"agreed"}});
    expect(await request(detail,mentor)).toMatchObject({status:200,data:{items:expect.arrayContaining([
      expect.objectContaining({id:session.data.id,accepted:expect.objectContaining({startsAt:tomorrow+"T20:30:00+00:00"})}),
    ])}});
    expect(await request(path,mentee,command("propose_agreement",{id:rel,expectedVersion:4,terms:{...terms,title:"Revised reading practice"}}))).toMatchObject({status:200,data:{version:5}});
    expect(await request(path,mentor,command("confirm_agreement",{id:rel,expectedVersion:5,revision:2,confirmed:true}))).toMatchObject({status:200,data:{version:6}});
    expect(await request(path,mentee,command("confirm_agreement",{id:rel,expectedVersion:6,revision:2,confirmed:true}))).toMatchObject({status:200,data:{version:7}});
    await controls.command("mentorship","emergency_pause");
    expect(await request(detail,mentee)).toMatchObject({status:200,data:{state:"paused",coordinationPaused:true}});
    expect(await request(path,mentee,command("resume",{id:rel,expectedVersion:8,confirmed:true}))).toMatchObject({status:403});
    await controls.command("mentorship_coordination","resume");
    expect(await request(detail,mentee)).toMatchObject({status:200,data:{state:"paused",coordinationPaused:false}});
    expect(await request(path,mentee,command("resume",{id:rel,expectedVersion:8,confirmed:true}))).toMatchObject({status:200,data:{state:"active",version:9}});
    expect(await request(member,mentee,command("withdraw",{role:"mentee",expectedVersion:1,purpose:"discovery"}),"PATCH")).toMatchObject({status:200});
    expect(await request(detail,mentee)).toMatchObject({status:200,data:{state:"active"}});
    sql("insert into feed_data.member_blocks(actor_id,target_id) values('" + mentee.id + "','" + mentor.id + "');");
    const restricted = await request(detail,mentor);
    expect(restricted).toMatchObject({status:200,data:{state:"safety_restricted"}});
    expect(restricted.data).not.toHaveProperty("items");
    sql("delete from feed_data.member_blocks where actor_id='" + mentee.id + "' and target_id='" + mentor.id + "';");
    expect(await request(detail,mentee)).toMatchObject({status:200,data:{state:"safety_restricted"}});
    expect(await request(path,mentee,command("report",{id,category:"unsafe_activity",explanation:"I want to report an unsafe arrangement."}))).toMatchObject({status:200});
    expect(await request(path,mentee,command("end",{id:rel,expectedVersion:10,confirmed:true}))).toMatchObject({status:200,data:{state:"ended"}});
    expect((await request(detail,mentee)).data).not.toHaveProperty("items");
    rehearseDatabaseRecovery(restored=>{
      expect(restored(`select state='ended' and safety_restricted_at is not null from private.c44_relationships where id='${rel}';`)).toBe("t");
      expect(restored(`select count(*) from private.c44_agreements where relationship='${rel}';`)).toBe("2");
      expect(restored(`select count(*)>=2 from private.c44_items where relationship='${rel}';`)).toBe("t");
      expect(restored("select not private.c46_gate('mentorship_coordination',true);")).toBe("t");
    });
    expect(await request(moderation,mentee)).toMatchObject({status:403});
    const assignee = await makeMember();
    for (const member of [founder,assignee]) finishPersonalOnboarding(member);
    sql(`insert into public.role_assignments(user_id,role) values('${assignee.id}','administrator');`);
    const reviewer = await staffWorkspace(assignee);
    const listed = await request(moderation,lead.staff,undefined,"GET",api,lead.workspace);
    expect(listed).toMatchObject({status:200,data:{items:[{state:"open"}]}});
    expect(JSON.stringify(listed.data)).not.toContain("unsafe arrangement");
    const casePath = moderation+"/"+listed.data.items[0].id;
    expect(await request(casePath,lead.staff,undefined,"GET",api,lead.workspace)).toMatchObject({status:403});
    expect(await request(casePath,reviewer.staff,undefined,"GET",api,reviewer.workspace)).toMatchObject({status:403});
    expect(await request(casePath,lead.staff,command("assign",{reviewer:assignee.handle,expectedVersion:1,confirmed:true,
      reason:"Assign this report to an independent administrator."}),"PATCH",api,lead.workspace)).toMatchObject({status:200,data:{state:"assigned",version:2}});
    expect(await request(casePath,reviewer.staff,undefined,"GET",api,reviewer.workspace)).toMatchObject({
      status:200,data:{category:"unsafe_activity",explanation:"I want to report an unsafe arrangement."},
    });
    expect(await request(casePath,reviewer.staff,command("refer",{expectedVersion:2,confirmed:true,
      reason:"Refer the report to existing platform moderation."}),"PATCH",api,reviewer.workspace)).toMatchObject({status:200,data:{state:"referred"}});
    sql(`delete from public.role_assignments where user_id='${assignee.id}';
      delete from private.platform_bootstrap where user_id='${founder.id}';`);
    console.log("C4.4 lifecycle loopback milliseconds",JSON.stringify(lifecycleTimings));
  } finally {
    clearActivation();
    sql(`delete from private.c44_preparation; delete from private.c43_settings;
      delete from private.platform_bootstrap where user_id='${founder.id}';
      delete from private.c43_profiles where actor in ('${mentor.id}','${mentee.id}','${second.id}');
      delete from private.c44_fixture;
      delete from private.c43_fixture;`);
  }
});


test("C4.4 measures bounded indexed discovery at disposable scale", async ({ signedIn: mentor, makeMember }) => {
  test.setTimeout(220_000);
  const reviewer = await makeMember();
  finishPersonalOnboarding(mentor);
  sql(`insert into private.c43_fixture values(true); insert into private.c44_fixture default values;
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${mentor.id}','identity','verified','review','${reviewer.id}',now());
    insert into public.user_settings(user_id,discoverable) values('${mentor.id}',true)
      on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id='${mentor.id}';`);
  try {
    expect(await request(member,mentor,save("mentor"),"PATCH")).toMatchObject({status:200});
    const snapshot = JSON.stringify({...pref("mentee"),skills:undefined});
    let count = 0;
    for (const size of [1000,10000,50000,100000]) {
      while (count<size) {
        const end=Math.min(count+2500,size);
        sql(`begin;
          create temporary table cohort on commit drop as select md5('c44-bench-user-'||n)::uuid actor,
            md5('c44-bench-profile-'||n)::uuid profile,n from generate_series(${count+1},${end}) n;
          insert into auth.users(id,email,email_confirmed_at,invited_at,raw_user_meta_data)
            select actor,'c44bench'||n||'@disposable.example.invalid',now(),now(),'{"signup_path":"organization"}' from cohort;
          insert into public.profiles(user_id,username,display_name,is_visible)
            select actor,'mentee_bench_'||n,'Synthetic learner '||n,true from cohort where n%20=0
            on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,is_visible=true;
          insert into public.user_settings(user_id,discoverable) select actor,true from cohort where n%20=0
            on conflict(user_id) do update set discoverable=true;
          insert into private.c43_profiles(id,actor,role,version,preferences,adult_at,participation_at,safeguarding_at,discovery,
            recommendations,requests,request_id,request_hash)
            select profile,actor,'mentee',1, case when n%20=0 then '${snapshot}'::jsonb
              else jsonb_set('${snapshot}'::jsonb,'{topics}','["leadership"]') end,
              now(),now(),now(),true,true,true,gen_random_uuid(),'disposable performance fixture' from cohort;
          commit;`);
        count=end;
      }
      sql("analyze private.c44_candidate_topics;");
      const discoveryPath=path+"/matches?lane=discovery&role=mentor&topic=educational_guidance";
      let start=performance.now();
      const discovery=await request(discoveryPath,mentor);
      const discoveryMs=Math.round(performance.now()-start);
      expect(discovery).toMatchObject({status:200,data:{state:"available"}});
      start=performance.now();
      const recommendations=await request(discoveryPath.replace("discovery","recommendations"),mentor);
      const recommendationMs=Math.round(performance.now()-start);
      expect(recommendations).toMatchObject({status:200,data:{state:"available"}});
      const reference=sql(`select string_agg(username,',' order by id) from (
        select c.id,p.username from private.c43_profiles c join public.profiles p on p.user_id=c.actor
        where c.role='mentee' and c.discovery and (c.preferences->'topics') ? 'educational_guidance'
          and p.username like 'mentee_bench_%'
          and private.c44_available(c,private.c44_settings(),private.c43_defaults())
        order by c.id limit 8
      ) exhaustive;`).split(",");
      expect(reference).toHaveLength(8);
      const actual=discovery.data.items.map((item:{username:string}) => item.username);
      expect(actual).toEqual(reference);
      const plan=JSON.parse(sql(`explain (analyze,format json) select profile from private.c44_candidate_topics
        where role='mentee' and topic='educational_guidance' order by profile limit 129;`))[0];
      expect(JSON.stringify(plan)).toContain("c44_candidate_topic_page");
      console.log("C4.4 disposable discovery",JSON.stringify({profiles:size,discoveryMs,recommendationMs,
        bytes:Buffer.byteLength(JSON.stringify(discovery.data)),referenceHits:actual.length,sqlProbeMs:plan["Execution Time"]}));
    }
  } finally {
    sql("delete from private.c44_fixture; delete from private.c43_fixture;");
  }
});
