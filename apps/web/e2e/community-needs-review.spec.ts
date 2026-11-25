import { randomUUID } from "node:crypto";
import type { NeedReviewCase, NeedReviewQueue } from "@ayinou/shared";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";
import { needReviewLabel } from "../src/lib/community-needs-review-i18n";
import { sessionSecurityMessages } from "../src/lib/session-security-i18n";

const base = "/api/v1/me/community-needs";
const staff = "/api/v1/private/community-needs-review";
const note = "Synthetic private rationale for disposable review";
const proposal = {
  title: "Study room access", description: "A local study room would help learners use public reading materials.",
  category: "education", area: "Ouest", beneficiaries: "Students",
  references: [{ url: "https://example.org/library", description: "Example local resource" }],
};

async function authenticate(member: Member) {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing authenticator fixture");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token, secret };
}

async function request<T>(member: Member, path: string, expected: number | number[], method = "GET", body?: object, workspace?: string): Promise<T> {
  const response = await fetch(api + path, { method, signal: AbortSignal.timeout(10000),
    headers: { Authorization: "Bearer " + member.token, "Idempotency-Key": randomUUID(),
      ...(body && { "Content-Type": "application/json" }), ...(workspace && { "X-Ayinou-Workspace": workspace }) },
    body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  expect(Array.isArray(expected) ? expected : [expected], method + " " + path + " " + (response.ok ? "" : JSON.stringify(result))).toContain(response.status);
  return result;
}

test("C1.2 reviews, corrections and independent challenges stay scoped and private", async ({ browser, page, context, signedIn, makeMember }) => {
  test.setTimeout(120000);
  const [owner, moderator, reviewerAccount, appealAccount, peer] = await Promise.all(Array.from({length:5}, () => makeMember()));
  for (const person of [signedIn,owner,moderator,reviewerAccount,appealAccount,peer]) finishPersonalOnboarding(person);
  const [founder, triage, reviewer, challenger] = await Promise.all([owner,moderator,reviewerAccount,appealAccount].map(authenticate));
  const communityId = sql("select id from feed_data.communities where slug='ouest';");
  const otherId = sql("select id from feed_data.communities where slug='centre';");
  const signature = "public.c12_needs_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,jsonb,uuid)";
  expect(sql(`select not has_function_privilege('authenticated','${signature}','execute')
    and not has_function_privilege('anon','${signature}','execute')
    and has_function_privilege('service_role','${signature}','execute')
    and not has_table_privilege('service_role','private.c12_events','select')
    and (select bool_and(relrowsecurity) from pg_class where oid in ('private.c12_events'::regclass,'private.c12_cases'::regclass));`)).toBe("t");
  await request(founder, staff + "?lane=admin",404,"GET",undefined,randomUUID());
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into private.verification_reviewers(user_id) values('${reviewer.id}'),('${challenger.id}');
    insert into public.role_assignments(user_id,role) values('${triage.id}','moderator');
    insert into feed_data.community_memberships(community_id,user_id) values
      ('${communityId}','${signedIn.id}'),('${otherId}','${signedIn.id}'),('${communityId}','${triage.id}'),('${communityId}','${peer.id}');
    insert into feed_data.community_staff(community_id,user_id,role) values('${communityId}','${triage.id}','moderator');
    insert into private.c11_intake_fixture values(true,true);
    insert into private.c12_fixture values(true);`);
  try {
    const f = (await apiCall(founder,"/api/v1/me/private-workflows",200,"POST",{kind:"admin_workspace"})).id as string;
    const r = (await apiCall(reviewer,"/api/v1/me/private-workflows",200,"POST",{kind:"verification_workspace"})).id as string;
    const c = (await apiCall(challenger,"/api/v1/me/private-workflows",200,"POST",{kind:"verification_workspace"})).id as string;
    await request(triage,staff+"?lane=triage",403,"GET",undefined,f);
    await request(owner,staff+"?lane=admin",[401,403],"GET",undefined,f);
    for (const [account,role] of [[triage,"triage"],[reviewer,"review"],[challenger,"review"]] as const) {
      await request(founder,staff,200,"POST",{action:"grant",role,target:account.id,communityId,requestId:randomUUID(),confirmed:true,note},f);
    }
    const t = (await apiCall(triage,"/api/v1/me/private-workflows",200,"POST",{kind:"moderation_workspace"})).id as string;
    const create = async (community = communityId) => request<{id:string}>(signedIn,base,201,"POST",{communityId:community,content:proposal});
    const a = await create(), sibling = await create(), other=await create(otherId);
    for (const item of [a,sibling,other]) await request(signedIn,base+"/"+item.id,200,"PATCH",{action:"submit",confirmed:true,expectedRevision:1});
    const staffCase = (id: string, lane: string) => staff + "/" + id + "?lane=" + lane;
    const memberCase = base+"/"+a.id+"/review";
    const act = (actor:Member, id:string, lane:string, workspace:string, action:string, version:number, data={}, expected=200) =>
      request<NeedReviewCase>(actor,staffCase(id,lane),expected,"PATCH",{action,expectedRevision:version,requestId:randomUUID(),confirmed:true,note,...data},workspace);
    await request(peer,memberCase,404);
    await request(triage,staffCase(a.id,"triage"),404,"GET",undefined,t);
    await act(founder,a.id,"admin",f,"assign_review",0,{target:reviewer.id},403);
    await act(founder,a.id,"admin",f,"assign_triage",0,{target:triage.id});
    await act(founder,sibling.id,"admin",f,"assign_triage",0,{target:triage.id});
    await act(founder,other.id,"admin",f,"assign_triage",0,{target:triage.id},403);
    expect((await request<NeedReviewQueue>(triage,staff+"?lane=triage",200,"GET",undefined,t)).cases).toHaveLength(2);
    await request(triage,staffCase(other.id,"triage"),404,"GET",undefined,t);
    await act(triage,a.id,"triage",t,"supported",1,{},403);
    await act(triage,a.id,"triage",t,"duplicate",1,{target:sibling.id});
    await act(triage,a.id,"triage",t,"duplicate",2,{target:sibling.id},409);
    await act(triage,a.id,"triage",t,"request_information",2,{summary:"clarify_references"});
    const memberReview=await request<NeedReviewCase>(signedIn,memberCase,200);
    expect(memberReview.state).toBe("needs_information");
    expect(JSON.stringify(memberReview)).not.toContain(note);
    expect(memberReview.versions).toBeUndefined();
    sql(`insert into private.m23_restrictions(subject_id,capability,scope_kind,scope_id,authority,max_minutes,category,starts_at,expires_at)
      values('${signedIn.id}','community_need_submit','community','${communityId}','founder',60,'safety',now(),now()+interval '1 hour');`);
    await request(signedIn,base,403,"POST",{communityId,content:proposal});
    const scopedDraft=await create(otherId);
    expect(scopedDraft.id).toBeTruthy();
    const correction={action:"correct",confirmed:true,requestId:randomUUID(),expectedRevision:3,expectedEvidenceRevision:2,
      content:{...proposal,title:"Updated study room access"}};
    const changes=await Promise.all([request<NeedReviewCase>(signedIn,memberCase,200,"PATCH",correction),request<NeedReviewCase>(signedIn,memberCase,200,"PATCH",correction)]);
    expect(changes.map((x)=>x.evidenceRevision)).toEqual([3,3]);
    await request(signedIn,base+"/"+sibling.id,200,"PATCH",{action:"withdraw",expectedRevision:2,confirmed:true});
    await act(triage,a.id,"triage",t,"refer",4);
    await act(founder,a.id,"admin",f,"assign_review",5,{target:founder.id},403);
    const conflictProject = randomUUID();
    sql(`insert into private.community_projects(id,creator_id,owner_user_id,association_id,submission_key,request_digest)
      values('${conflictProject}','${challenger.id}','${challenger.id}','${communityId}',gen_random_uuid(),decode('00','hex'));`);
    await act(founder,a.id,"admin",f,"assign_review",5,{target:challenger.id},403);
    sql(`delete from private.community_projects where id='${conflictProject}';`);
    await act(founder,a.id,"admin",f,"assign_review",5,{target:reviewer.id});
    const reviewerContext = await browser.newContext({ baseURL: web, viewport: { width: 390, height: 844 } });
    try {
      await inEnglish(reviewerContext);
      const reviewPage = await reviewerContext.newPage();
      await login(reviewPage, reviewer);
      await solveMfa(reviewPage, reviewer.secret);
      await reviewPage.goto("/verification/review");
      await reviewPage.getByRole("button", { name: sessionSecurityMessages.en.openReview, exact: true }).click();
      await expect(reviewPage.getByRole("heading", { name: needReviewLabel("en", "queue"), exact: true })).toBeVisible();
      await expect(reviewPage.getByRole("button", { name: new RegExp(a.id) })).toBeVisible();
      await expect(reviewPage.getByRole("button", { name: new RegExp(other.id) })).toHaveCount(0);
      expect(await reviewPage.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
      await reviewerContext.close();
    }
    const evidence=await request<NeedReviewCase>(reviewer,staffCase(a.id,"review"),200,"GET",undefined,r);
    expect(evidence.versions?.map((v)=>v.content.title)).toEqual(["Updated study room access",proposal.title,proposal.title]);
    expect((await request<NeedReviewCase>(founder,staffCase(a.id,"admin"),200,"GET",undefined,f)).versions).toBeUndefined();
    await act(reviewer,a.id,"review",r,"observe",6,{},403);
    await act(reviewer,a.id,"review",r,"accept",6,{conflictFree:true});
    await act(reviewer,a.id,"review",r,"observe",7);
    await act(reviewer,a.id,"review",r,"insufficient_evidence",8,{summary:"missing_independent_sources"});
    const adverse=await request<NeedReviewCase>(signedIn,memberCase,200);
    expect(adverse.state).toBe("insufficient_evidence");
    expect(adverse.findingId).toBeTruthy();
    expect(adverse.history.some((entry) => entry.summary === "missing_independent_sources")).toBe(true);
    const challenge={action:"challenge",confirmed:true,requestId:randomUUID(),expectedRevision:9,findingId:adverse.findingId,note};
    sql(`update private.c12_events set happened_at=now()-interval '14 days' where id='${adverse.findingId}';`);
    await request(signedIn,memberCase,409,"PATCH",challenge);
    sql(`update private.c12_events set happened_at=now() where id='${adverse.findingId}';`);
    await page.goto("/communities/intake/needs/"+a.id);
    await page.locator("summary").filter({hasText:needReviewLabel("en","challenge")}).click();
    await page.getByLabel(needReviewLabel("en","note"),{exact:false}).fill(note);
    await page.getByLabel(needReviewLabel("en","confirm"),{exact:true}).check();
    await page.getByRole("button",{name:needReviewLabel("en","challenge"),exact:true}).click();
    await expect(page.getByText(needReviewLabel("en","pending"),{exact:true})).toBeVisible();
    await request(signedIn,memberCase,409,"PATCH",{...challenge,requestId:randomUUID(),expectedRevision:10});
    await act(founder,a.id,"admin",f,"assign_challenge",10,{target:reviewer.id},403);
    await act(founder,a.id,"admin",f,"assign_challenge",10,{target:challenger.id});
    await request(reviewer,staffCase(a.id,"review"),404,"GET",undefined,r);
    await act(challenger,a.id,"review",c,"accept",11,{conflictFree:true});
    const returned=await act(challenger,a.id,"review",c,"return_challenge",12);
    expect(returned).toMatchObject({state:"submitted",challenge:{status:"returned"}});
    expect(sql(`select count(*) from private.c12_events where need_id='${a.id}' and action='insufficient_evidence';`)).toBe("1");
    expect(sql(`select count(*) from private.c12_events where need_id='${a.id}' and action='correct';`)).toBe("1");
    const ownerNotices=await request<{notifications:unknown[]}>(signedIn,"/api/v1/me/notifications",200);
    expect(JSON.stringify(ownerNotices)).toContain("community_need_notice");
    expect(JSON.stringify(ownerNotices)).not.toContain(note);
    expect(JSON.stringify(await request(peer,"/api/v1/me/notifications",200))).not.toContain(a.id);

    await page.goto("/communities/intake/needs/"+a.id);
    await page.setViewportSize({width:390,height:844});
    for (const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.reload();
      await expect(page.getByRole("heading",{name:needReviewLabel(locale,"reviewStatus")})).toBeVisible();
      await expect(page.getByText(needReviewLabel(locale,"returned"),{exact:true})).toBeVisible();
      expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390);
    }
  } finally {
    sql("delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap;");
  }
});
