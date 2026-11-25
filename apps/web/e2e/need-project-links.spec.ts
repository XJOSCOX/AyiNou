import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { NeedProjectLink, NeedProjectLinkPage, NeedPublication, NeedReviewCase, PublishedNeed } from "@ayinou/shared";
import { publicationLabel } from "../src/lib/community-need-publication-i18n";
import { needProjectLabel } from "../src/lib/need-project-links-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";

const root="/api/v1/private/need-project-links";
const intake="/api/v1/me/community-needs";
const reviews="/api/v1/private/community-needs-review";
const publications="/api/v1/private/community-need-publications";
const title="Neighborhood learning access";
const projectTitle="A neighborhood reading room";
const objective="Open a shared space offering quiet reading hours to local learners.";
const purpose="The reading room would make shared learning materials available locally.";
const notes="A private review reason for the directly related objectives.";
const summary={title,description:"Provide access to local study materials for learners.",category:"education",area:"Ouest",beneficiaries:"Learners"};
const evidence={...summary,title:"Private source case",description:"Private witness evidence",
  references:[{url:"https://example.org/study",description:"Private evidence fixture"}]};
const receipt=(extra:object)=>({requestId:randomUUID(),confirmed:true,...extra});

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

test("C1.5 carries a private need through independent review, publication, and a linked project",async({page,context,signedIn,makeMember})=>{
  test.setTimeout(120000);
  for(const [file,assertions] of [["c11_community_needs_test.sql",9],["c15_community_needs_integration_test.sql",7]] as const) {
    const statement=readFileSync(resolve(__dirname,"../../../supabase/tests/database",file),"utf8");
    const tap=sql(statement);
    expect(tap).not.toMatch(/^not ok/m);
    expect(tap.match(/^ok /gm)).toHaveLength(assertions);
  }
  const [author,founderAccount,reviewerAccount,publisherAccount,triageAccount,evidenceAccount,outsider,peer]=
    await Promise.all(Array.from({length:8},()=>makeMember()));
  for(const member of [signedIn,author,founderAccount,reviewerAccount,publisherAccount,triageAccount,evidenceAccount,outsider,peer]) {
    finishPersonalOnboarding(member);
  }
  const [founder,reviewer,publisher,triager,evidenceReviewer]=
    await Promise.all([founderAccount,reviewerAccount,publisherAccount,triageAccount,evidenceAccount].map(mfa));
  const room=sql("select id from feed_data.communities where slug='ouest';");
  const directory="/api/v1/private/communities/"+room+"/needs";
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
    insert into private.verification_reviewers(user_id)
      values('${reviewer.id}'),('${publisher.id}'),('${evidenceReviewer.id}'),('${triager.id}');
    insert into feed_data.community_memberships(community_id,user_id)
      values('${room}','${signedIn.id}'),('${room}','${author.id}'),('${room}','${peer.id}'),('${room}','${triager.id}');
    insert into feed_data.community_staff(community_id,user_id,role) values('${room}','${triager.id}','moderator');
    insert into private.c11_intake_fixture values(true,true);
    insert into private.c12_fixture values(true);
    insert into private.c13_fixture values(true);`);
  await call(signedIn,root,404);
  sql("insert into private.c14_fixture values(true);");
  try {
    await call(null,root+"/options",401);
    const workspace=async (who:Member,kind:string)=>String((await apiCall(who,"/api/v1/me/private-workflows",200,"POST",{kind})).id);
    const admin=await workspace(founder,"admin_workspace");
    const reviewerWorkspace=await workspace(reviewer,"verification_workspace");
    const evidenceWorkspace=await workspace(evidenceReviewer,"verification_workspace");
    const publicationWorkspace=await workspace(publisher,"verification_workspace");
    for(const [member,role] of [[triager,"triage"],[triager,"review"],[evidenceReviewer,"review"],[publisher,"review"],[reviewer,"review"]] as const) {
      await call(founder,reviews,200,"POST",receipt({action:"grant",role,target:member.id,communityId:room,note:notes}),admin);
    }
    const triageWorkspace=await workspace(triager,"moderation_workspace");

    const {id:need}=await call<{id:string}>(author,intake,201,"POST",{communityId:room,content:evidence});
    const memberCase=intake+"/"+need;
    await call(peer,memberCase,404);
    await call(author,memberCase+"/publication",404);
    await call(author,memberCase,200,"PATCH",{action:"submit",expectedRevision:1,confirmed:true});
    const caseFor=(lane:string)=>reviews+"/"+need+"?lane="+lane;
    const review=(who:Member,lane:string,key:string,action:string,version:number,extra={},status=200)=>
      call<NeedReviewCase>(who,caseFor(lane),status,"PATCH",receipt({action,expectedRevision:version,note:notes,...extra}),key);
    await call(triager,caseFor("triage"),404,"GET",undefined,triageWorkspace);
    await review(founder,"admin",admin,"assign_triage",0,{target:triager.id});
    await review(triager,"triage",triageWorkspace,"refer",1);
    await review(founder,"admin",admin,"assign_review",2,{target:evidenceReviewer.id});
    await review(evidenceReviewer,"review",evidenceWorkspace,"accept",3,{conflictFree:true});
    await review(evidenceReviewer,"review",evidenceWorkspace,"request_information",4,{summary:"clarify_scope"});
    const clarification=await call<NeedReviewCase>(author,memberCase+"/review",200);
    expect(clarification.state).toBe("needs_information");
    expect(JSON.stringify(clarification)).not.toContain(notes);
    const correction=receipt({action:"correct",expectedRevision:5,expectedEvidenceRevision:2,
      content:{...evidence,beneficiaries:"Residents without nearby study materials"}});
    const corrected=await Promise.all([1,2].map(()=>call<NeedReviewCase>(author,memberCase+"/review",200,"PATCH",correction)));
    expect(corrected.map(current=>current.evidenceRevision)).toEqual([3,3]);
    const finding=await review(evidenceReviewer,"review",evidenceWorkspace,"supported",6,{summary:"evidence_matches"});
    expect(finding.state).toBe("supported");
    const status=await call<NeedPublication>(author,memberCase+"/publication",200);
    const pending=await call<NeedPublication>(author,memberCase+"/publication",200,"PATCH",
      receipt({action:"request",expectedRevision:0,audience:"community",attribution:false,
        finding:status.finding,expectedEvidenceRevision:status.evidenceRevision,content:summary}));
    const publication=pending.id!;
    const publicationReview=(lane:string)=>publications+"/"+publication+"?lane="+lane;
    await call(peer,directory+"/"+publication,404);
    await call(founder,publicationReview("admin"),200,"PATCH",receipt({action:"assign",expectedRevision:1,target:publisher.id,note:notes}),admin);
    await call(publisher,publicationReview("review"),200,"PATCH",receipt({action:"approve",expectedRevision:2,note:notes}),publicationWorkspace);
    const live=await call<PublishedNeed>(peer,directory+"/"+publication,200);
    expect(live.content).toEqual(summary);
    expect(live.attribution).toBeNull();
    for(const secret of [need,evidence.title,evidence.description,evidence.references[0].url,notes])expect(JSON.stringify(live)).not.toContain(secret);
    await call(outsider,directory+"/"+publication,404);
    expect((await call<NeedProjectLinkPage<{id:string}>>(outsider,root+"/options",200)).items).toEqual([]);
    expect((await call<NeedProjectLinkPage<{id:string}>>(signedIn,root+"/options",200)).items.map(item=>item.id)).toContain(publication);

    const discussionUrl="/communities/ouest?need="+publication;
    await page.goto(discussionUrl);
    await page.getByRole("button",{name:publicationLabel("en","discuss"),exact:true}).click();
    const discussion=page.getByRole("region",{name:"Discussion",exact:true});
    await discussion.getByRole("button",{name:publicationLabel("en","addReference"),exact:true}).click();
    const post=discussion.getByRole("textbox",{name:"Post text",exact:true});
    await expect(post).toHaveValue(discussionUrl);
    await post.fill("A member discussion about the reading room."+String.fromCharCode(10)+discussionUrl);
    await discussion.getByRole("button",{name:"Publish",exact:true}).click();
    await expect(discussion.getByText(/A member discussion about the reading room/)).toBeVisible();

    await page.goto("/projects/new");
    await page.locator("input[name=title]").fill(projectTitle);
    const projectFields={
      description:"A proposed shared study room for residents of Ouest.",
      problem:"Residents need a quiet place with shared study materials.",
      solution:"Organize a room and schedule weekly study hours.",
      objectives:objective,beneficiaries:"Residents seeking shared reading resources.",
      outcomes:"Open scheduled weekly study hours and lend local reading materials.",
    };
    for(const [name,value] of Object.entries(projectFields))await page.locator("textarea[name="+name+"]").fill(value);
    await page.locator("select[name=category]").selectOption("education");
    await page.getByRole("combobox",{name:needProjectLabel("en","draft"),exact:true}).selectOption(publication);
    await page.getByRole("button",{name:"Save draft",exact:true}).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\?needLink=/);
    const project=new URL(page.url()).pathname.split("/").at(-1)!;
    expect(sql(`select count(*) from private.c14_links where project_id='${project}';`)).toBe("0");
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
    for(const conflicting of [publisher,triager,evidenceReviewer]) {
      await cmd(founder,"assign",2,{target:conflicting.id,reason:notes},403,"admin",admin);
    }
    sql(`update private.community_projects set reviewer_id='${reviewer.id}' where id='${project}';`);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},403,"admin",admin);
    sql(`update private.community_projects set reviewer_id=null where id='${project}';`);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},200,"admin",admin);
    const assigned=await call<NeedProjectLinkPage<NeedProjectLink>>(reviewer,root+"?lane=review",200,"GET",undefined,reviewerWorkspace);
    expect(assigned.items[0].objective).toBe(objective);
    expect(JSON.stringify(assigned)).not.toContain("Private witness evidence");
    await cmd(reviewer,"approve",3,{reason:notes},400,"review",reviewerWorkspace);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},403,"review",admin);
    expect(sql(`select private.s2b_recent_mfa(owner_id,bound_session,true,extract(epoch from clock_timestamp())::bigint)
      and not private.s2b_recent_mfa(owner_id,bound_session,true,extract(epoch from clock_timestamp()-interval '16 minutes')::bigint)
      from private.s2b_workflows where id='${reviewerWorkspace}';`)).toBe("t");
    const originalExpiry=sql(`select expires_at from private.s2b_workflows where id='${reviewerWorkspace}';`);
    sql(`update private.s2b_workflows set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'
      where id='${reviewerWorkspace}';`);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},403,"review",reviewerWorkspace);
    sql(`update private.s2b_workflows set expires_at='${originalExpiry}' where id='${reviewerWorkspace}';`);
    await cmd(reviewerAccount,"approve",3,{reason:notes,relationshipConfirmed:true},401,"review",reviewerWorkspace);
    sql(`update private.c12_authority set revoked_at=now() where actor_id='${reviewer.id}' and community_id='${room}';`);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},403,"review",reviewerWorkspace);
    sql(`update private.c12_authority set revoked_at=null where actor_id='${reviewer.id}' and community_id='${room}';`);
    const decision=receipt({action:"approve",expectedRevision:3,reason:notes,relationshipConfirmed:true});
    const approvalReceipts=await Promise.all([1,2].map(()=>call<NeedProjectLink>(reviewer,root+"/"+requested.id+"?lane=review",200,"PATCH",decision,reviewerWorkspace)));
    expect(approvalReceipts.map(item=>item.state)).toEqual(["approved","approved"]);
    expect(sql(`select count(*) from private.c14_events where link_id='${requested.id}' and action='approve';`)).toBe("1");
    expect(sql(`select status from private.community_projects where id='${project}';`)).toBe("draft");
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);

    const projectPath="/api/v1/projects/"+project;
    const submitted=await apiCall(signedIn,projectPath+"/submit",200,"POST",{version:1});
    const assignment=await apiCall(founder,projectPath+"/review",200,"POST",{version:submitted.version,action:"assign",reason:notes});
    const preview=await apiCall(founder,projectPath+"?preview=review",200);
    const approved=await apiCall(founder,projectPath+"/review",200,"POST",
      {version:assignment.version,action:"approve",reason:notes,previewProof:preview.approval.proof});
    const publish=(version:number,publish:boolean)=>apiCall(signedIn,projectPath+"/publication",200,"PATCH",{version,publish});
    const published=await publish(approved.version,true);
    const linked=await call<NeedProjectLinkPage<{id:string;title:string}>>(peer,root+"/publication/"+publication,200);
    expect(linked.items).toEqual([{id:project,title:projectTitle}]);
    expect((await call<NeedProjectLinkPage<NeedProjectLink>>(outsider,root+"/project/"+project,200)).items).toEqual([]);
    sql(`delete from feed_data.community_memberships where community_id='${room}' and user_id='${peer.id}';`);
    await call(peer,root+"/publication/"+publication,404);
    expect((await call<NeedProjectLinkPage<NeedProjectLink>>(peer,root+"/project/"+project,200)).items).toEqual([]);
    sql(`insert into feed_data.community_memberships(community_id,user_id) values('${room}','${peer.id}');`);
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
    // Extra rows only exercise pagination. The lifecycle above uses native commands.
    const projectPrefix="00000000-4321-4000-8000-";
    const linkPrefix="ffffffff-4321-4000-8000-";
    sql(`insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,
        status,submitted_by,submitted_at,approved_at,directory_published_at)
      select ('${projectPrefix}'||lpad(i::text,12,'0'))::uuid,creator_id,owner_user_id,gen_random_uuid(),request_digest,
        status,submitted_by,submitted_at,approved_at,directory_published_at
      from private.community_projects cross join generate_series(1,21) i where id='${project}';
      insert into private.project_revisions(project_id,revision,author_id,proposal)
      select p.id,1,v.author_id,v.proposal from private.community_projects p
      cross join private.project_revisions v where p.id::text like '${projectPrefix}%' and v.project_id='${project}' and v.revision=1;
      insert into private.c14_links(id,project_id,publication_id,publication_snapshot,project_revision,
        initiated_version,organizer,author,organizer_authority,purpose,state,activated_at)
      select ('${linkPrefix}'||right(p.id::text,12))::uuid,p.id,q.publication_id,q.publication_snapshot,q.project_revision,
        q.initiated_version,q.organizer,q.author,q.organizer_authority,q.purpose,q.state,q.activated_at
      from private.community_projects p cross join private.c14_links q
      where p.id::text like '${projectPrefix}%' and q.id='${requested.id}';`);
    const firstPage=await call<NeedProjectLinkPage<{id:string}>>(peer,root+"/publication/"+publication,200);
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.nextCursor).toBe(firstPage.items.at(-1)?.id);
    const secondPage=await call<NeedProjectLinkPage<{id:string}>>(peer,root+"/publication/"+publication+"?after="+firstPage.nextCursor,200);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();
    const actualIds=[...firstPage.items,...secondPage.items].map(item=>item.id);
    const fixtureIds=Array.from({length:21},(_,index)=>projectPrefix+String(index+1).padStart(12,"0"));
    expect(actualIds).toEqual([...fixtureIds,project].sort().reverse());
    sql(`delete from private.c14_links where id::text like '${linkPrefix}%';
      delete from private.community_projects where id::text like '${projectPrefix}%';`);

    const unpublished=await publish(published.version,false);
    await publish(unpublished.version,true);
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);
    expect(sql(`select state from private.c14_links where id='${requested.id}';`)).toBe("revoked");

    const second=await call<NeedProjectLink>(signedIn,root,200,"POST",create());
    await cmd(author,"consent",1,{},200,"member",undefined,second.id);
    await cmd(founder,"assign",2,{target:reviewer.id,reason:notes},200,"admin",admin,second.id);
    await cmd(reviewer,"approve",3,{reason:notes,relationshipConfirmed:true},200,"review",reviewerWorkspace,second.id);
    await cmd(author,"withdraw",4,{},200,"member",undefined,second.id);
    expect((await call<NeedProjectLinkPage<unknown>>(peer,root+"/publication/"+publication,200)).items).toEqual([]);

    const third=await call<NeedProjectLink>(signedIn,root,200,"POST",create());
    await call(founder,publicationReview("admin"),200,"PATCH",receipt({action:"hide",expectedRevision:3,note:notes}),admin);
    expect(sql(`select state from private.c14_links where id='${third.id}';`)).toBe("revoked");
    await call(peer,root+"/publication/"+publication,404);
    expect(sql(`select action from private.c11_need_revisions where need_id='${need}' order by revision;`).split("\n"))
      .toEqual(["create","submit","edit"]);
    expect(sql(`select count(distinct action) from private.c12_events where need_id='${need}'
      and action in ('submit','assign_triage','refer','assign_review','accept','request_information','correct','supported');`)).toBe("8");
    expect(sql(`select count(distinct action) from private.c13_events where publication_id='${publication}'
      and action in ('request','assign','approve','hide');`)).toBe("4");
    expect(sql(`select count(distinct action) from private.c14_events where link_id='${requested.id}'
      and action in ('request','consent','assign','approve','activate','invalidate');`)).toBe("6");
  } finally {
    sql("delete from private.c14_fixture; delete from private.c13_fixture; delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap;");
  }
});
