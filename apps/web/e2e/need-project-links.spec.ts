import { randomUUID } from "node:crypto";
import type { NeedProjectLink, NeedProjectLinkPage } from "@ayinou/shared";
import { needProjectLabel } from "../src/lib/need-project-links-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";

const root="/api/v1/private/need-project-links";
const title="Neighborhood learning access";
const projectTitle="A neighborhood reading room";
const objective="Open a shared space offering quiet reading hours to local learners.";
const purpose="The reading room would make shared learning materials available locally.";
const notes="A private review reason for the directly related objectives.";

async function mfa(member:Member):Promise<Member> {
  const secret=await enroll(member);
  const client=localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({email:member.email,password:member.password})).error).toBeNull();
  const factor=(await client.auth.mfa.listFactors()).data?.totp[0];
  if(!factor)throw new Error("Missing test authenticator");
  const result=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(secret)});
  if(result.error)throw result.error;
  return {...member,token:result.data.access_token};
}

async function call<T>(member:Member|null,url:string,status:number|number[],method="GET",data?:object,workspace?:string):Promise<T> {
  const response=await fetch(api+url,{method,signal:AbortSignal.timeout(10000),headers:{...(member&&{Authorization:"Bearer "+member.token}),
    ...(data&&{"Content-Type":"application/json"}),...(workspace&&{"X-Ayinou-Workspace":workspace}),"Idempotency-Key":randomUUID()},
    body:data ? JSON.stringify(data) : undefined});
  const result=await response.json();
  expect(Array.isArray(status)?status:[status],method+" "+url+" "+(response.ok?"":JSON.stringify(result))).toContain(response.status);
  if(url.startsWith(root))expect(response.headers.get("cache-control")).toBe("private, no-store");
  return result;
}

test("C1.4 requires consent and independent link review and preserves both resource boundaries",async({page,context,signedIn,makeMember})=>{
  test.setTimeout(120000);
  const [author,founderAccount,reviewerAccount,publisherAccount,outsider,peer]=await Promise.all(Array.from({length:6},()=>makeMember()));
  for(const member of [signedIn,author,founderAccount,reviewerAccount,publisherAccount,outsider,peer])finishPersonalOnboarding(member);
  const [founder,reviewer,publisher]=await Promise.all([founderAccount,reviewerAccount,publisherAccount].map(mfa));
  const room=sql("select id from feed_data.communities where slug='ouest';");
  const [need,finding,publication,snapshot]=Array.from({length:4},()=>randomUUID());
  const signature="public.c14_links_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,jsonb)";
  expect(sql(`select has_function_privilege('service_role','${signature}','execute')
    and not has_function_privilege('authenticated','${signature}','execute') and not has_function_privilege('anon','${signature}','execute')
    and not has_table_privilege('service_role','private.c14_links','select')
    and (select count(*)=3 and bool_and(relrowsecurity) from pg_class where relnamespace='private'::regnamespace and relkind='r' and relname like 'c14_%');`)).toBe("t");
  await call(signedIn,root,404);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${signedIn.id}','identity','verified','review','${founder.id}',now());
    insert into public.user_settings(user_id,discoverable) values('${signedIn.id}',true)
      on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id='${signedIn.id}';
    insert into private.verification_reviewers(user_id) values('${reviewer.id}'),('${publisher.id}');
    insert into feed_data.community_memberships(community_id,user_id)
      values('${room}','${signedIn.id}'),('${room}','${author.id}'),('${room}','${peer.id}');
    insert into private.c11_intake_fixture values(true,true);
    insert into private.c12_fixture values(true);
    insert into private.c13_fixture values(true);
    insert into private.c11_needs(id,community_id,author_id,status,content)
      values('${need}','${room}','${author.id}','submitted','{"title":"Private source case","description":"Private witness evidence"}');
    insert into private.c12_cases(need_id,state,finding_id) values('${need}','supported','${finding}');
    insert into private.c12_events(id,need_id,community_id,action,state,evidence_revision)
      values('${finding}','${need}','${room}','supported','supported',1);
    insert into private.c13_publications(id,need_id,state,published_at) values('${publication}','${need}','published',now());
    insert into private.c13_events(id,publication_id,actor,revision,action,state,finding,evidence_revision,content,audience,attribution)
      values('${snapshot}','${publication}','${author.id}',1,'request','pending','${finding}',1,
      '{"title":"${title}","description":"Provide access to local study materials for learners.","category":"education","area":"Ouest","beneficiaries":"Learners"}','community',false);
    insert into private.c13_events(publication_id,actor,revision,action,state,proposal)
      values('${publication}','${publisher.id}',2,'approve','published','${snapshot}');
    update private.c13_publications set proposal='${snapshot}',live_proposal='${snapshot}' where id='${publication}';`);
  await call(signedIn,root,404);
  sql("insert into private.c14_fixture values(true);");
  try {
    await call(null,root+"/options",401);
    expect((await call<NeedProjectLinkPage<{id:string}>>(outsider,root+"/options",200)).items).toEqual([]);
    expect((await call<NeedProjectLinkPage<{id:string}>>(signedIn,root+"/options",200)).items.map(item=>item.id)).toContain(publication);
    const admin=String((await apiCall(founder,"/api/v1/me/private-workflows",200,"POST",{kind:"admin_workspace"})).id);
    const reviewerWorkspace=String((await apiCall(reviewer,"/api/v1/me/private-workflows",200,"POST",{kind:"verification_workspace"})).id);
    sql(`insert into private.c12_authority(community_id,actor_id,lane,granted_by,until_at)
      values('${room}','${reviewer.id}','review','${founder.id}',now()+interval '1 day'),
      ('${room}','${publisher.id}','review','${founder.id}',now()+interval '1 day');`);

    await page.goto("/projects/new");
    await page.locator("input[name=title]").fill(projectTitle);
    await page.locator("textarea[name=objectives]").fill(objective);
    await page.locator("select[name=category]").selectOption("education");
    await page.getByRole("combobox",{name:needProjectLabel("en","draft"),exact:true}).selectOption(publication);
    await page.getByRole("button",{name:"Save draft",exact:true}).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\?needLink=/);
    const project=new URL(page.url()).pathname.split("/").at(-1)!;
    expect(sql(`select count(*) from private.c14_links where project_id='${project}';`)).toBe("0");
    const receipt=(extra:object)=>({requestId:randomUUID(),confirmed:true,...extra});
    const create=()=>receipt({project,projectVersion:Number(sql(`select version from private.community_projects where id='${project}';`)),publication,reason:purpose});
    await call(author,root,403,"POST",create());
    const requested=await call<NeedProjectLink>(signedIn,root,200,"POST",create());
    expect(requested.state).toBe("awaiting_consent");
    const cmd=(member:Member,action:string,revision:number,extra={},status=200,lane="member",workspace?:string,id=requested.id)=>
      call<NeedProjectLink>(member,root+"/"+id+"?lane="+lane,status,"PATCH",receipt({action,expectedRevision:revision,...extra}),workspace);
    await cmd(signedIn,"consent",1,{},403);
    await call(outsider,root+"/project/"+project,404);
    const consent=await call<NeedProjectLinkPage<NeedProjectLink>>(author,root,200);
    expect(consent.items[0]).toMatchObject({purpose,project:null,asAuthor:true});
    expect(JSON.stringify(consent)).not.toContain(projectTitle);
    expect(JSON.stringify(consent)).not.toContain(need);
    await cmd(author,"consent",1);
    await cmd(founder,"approve",2,{reason:notes,relationshipConfirmed:true},403,"admin",admin);
    await cmd(founder,"assign",2,{target:publisher.id,reason:notes},403,"admin",admin);
    sql(`update private.community_projects set reviewer_id='${reviewer.id}' where id='${project}';`);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},403,"admin",admin);
    sql(`update private.community_projects set reviewer_id=null where id='${project}';`);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},200,"admin",admin);
    const assigned=await call<NeedProjectLinkPage<NeedProjectLink>>(reviewer,root+"?lane=review",200,"GET",undefined,reviewerWorkspace);
    expect(assigned.items[0].objective).toBe(objective);
    expect(JSON.stringify(assigned)).not.toContain("Private witness evidence");
    await cmd(reviewer,"approve",3,{reason:notes},400,"review",reviewerWorkspace);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},403,"review",admin);
    const decision=receipt({action:"approve",expectedRevision:3,reason:notes,relationshipConfirmed:true});
    const reviews=await Promise.all([1,2].map(()=>call<NeedProjectLink>(reviewer,root+"/"+requested.id+"?lane=review",200,"PATCH",decision,reviewerWorkspace)));
    expect(reviews.map(item=>item.state)).toEqual(["approved","approved"]);
    expect(sql(`select count(*) from private.c14_events where link_id='${requested.id}' and action='approve';`)).toBe("1");
    expect(sql(`select status from private.community_projects where id='${project}';`)).toBe("draft");
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);

    sql(`update private.community_projects set status='approved',submitted_by='${signedIn.id}',submitted_at=now(),approved_at=now() where id='${project}';`);
    const publish=(version:number,publish:boolean)=>apiCall(signedIn,"/api/v1/projects/"+project+"/publication",200,"PATCH",{version,publish});
    await publish(1,true);
    const linked=await call<NeedProjectLinkPage<{id:string;title:string}>>(peer,root+"/publication/"+publication,200);
    expect(linked.items).toEqual([{id:project,title:projectTitle}]);
    expect((await call<NeedProjectLinkPage<NeedProjectLink>>(outsider,root+"/project/"+project,200)).items).toEqual([]);
    const memberView=await call<NeedProjectLinkPage<NeedProjectLink>>(peer,root+"/project/"+project,200);
    expect(memberView.items[0].need?.title).toBe(title);
    expect(JSON.stringify(memberView)).not.toContain(purpose);
    await call(outsider,root+"/publication/"+publication,404);
    const inbox=await call<{notifications: {kind: string}[]}>(author,"/api/v1/me/notifications",200);
    const linkNotices=inbox.notifications.filter(notice=>notice.kind==="need_project_notice");
    expect(linkNotices.length).toBeGreaterThan(0);
    for(const secret of [notes,objective,need,projectTitle])expect(JSON.stringify(linkNotices)).not.toContain(secret);

    for(const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.setViewportSize({width:locale==="en"?1280:390,height:844});
      await page.goto("/communities/ouest?need="+publication);
      await expect(page.getByRole("heading",{name:needProjectLabel(locale,"projects")})).toBeVisible();
      await expect(page.getByRole("link",{name:projectTitle,exact:true})).toBeVisible();
      expect(await page.locator("body").evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(locale==="en"?1280:390);
    }
    await publish(2,false);
    await publish(3,true);
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);
    expect(sql(`select state from private.c14_links where id='${requested.id}';`)).toBe("revoked");

    const second=await call<NeedProjectLink>(signedIn,root,200,"POST",create());
    await cmd(author,"consent",1,{},200,"member",undefined,second.id);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},200,"admin",admin,second.id);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},200,"review",reviewerWorkspace,second.id);
    await cmd(author,"withdraw",4,{},200,"member",undefined,second.id);
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);

    const third=await call<NeedProjectLink>(signedIn,root,200,"POST",create());
    sql(`update private.c13_publications set state='hidden',live_proposal=null where id='${publication}';`);
    expect(sql(`select state from private.c14_links where id='${third.id}';`)).toBe("revoked");
    await call(peer,root+"/publication/"+publication,404);
  } finally {
    sql("delete from private.c14_fixture; delete from private.c13_fixture; delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap;");
  }
});
