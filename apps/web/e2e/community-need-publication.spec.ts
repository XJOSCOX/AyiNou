import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import type { NeedPublication, NeedPublicationPage, NeedReviewCase, PublishedNeed } from "@ayinou/shared";
import { publicationLabel } from "../src/lib/community-need-publication-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";

const intake = "/api/v1/me/community-needs";
const reviews = "/api/v1/private/community-needs-review";
const staff = "/api/v1/private/community-need-publications";
const note = "Disposable private reviewer rationale";
const privateTitle = "Original evidence case";
const summary = {
  title: "Shared study resources",
  description: "A community reading room would improve access to study resources.",
  category: "education", area: "Ouest", beneficiaries: "Local learners",
};
const original = { ...summary, title: privateTitle, references: [{ url: "https://example.org/source", description: "Private evidence record" }] };

async function mfa(member: Member): Promise<Member> {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing test authenticator");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token };
}

async function call<T>(member: Member | null, path: string, expected: number | number[], method = "GET", body?: object, workspace?: string): Promise<T> {
  const response = await fetch(api + path, { method, signal: AbortSignal.timeout(10000),
    headers: { "Idempotency-Key": randomUUID(), ...(member && { Authorization: "Bearer " + member.token }), ...(body && { "Content-Type": "application/json" }),
      ...(workspace && { "X-Ayinou-Workspace": workspace }) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  expect(Array.isArray(expected) ? expected : [expected], method + " " + path + " " + (response.ok ? "" : JSON.stringify(result))).toContain(response.status);
  if (path.includes("publication") || path.includes("/private/communities/")) {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  }
  return result;
}

test("C1.3 publishes an independently approved snapshot only to authorized community members", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(150000);
  const [f, a, e, r, c, outsider, peer] = await Promise.all(Array.from({length:7}, () => makeMember()));
  for (const person of [f,a,e,r,c,outsider,peer,signedIn]) finishPersonalOnboarding(person);
  const [founder, triager, evidence, reviewer, challenger] = await Promise.all([f,a,e,r,c].map(mfa));
  const room = sql("select id from feed_data.communities where slug='ouest';");
  const other = sql("select id from feed_data.communities where slug='centre';");
  const directory = "/api/v1/private/communities/" + room + "/needs";
  const signature = "public.c13_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,text,uuid,jsonb)";
  expect(sql(`select has_function_privilege('service_role','${signature}','execute')
    and not has_function_privilege('authenticated','${signature}','execute')
    and not has_function_privilege('anon','${signature}','execute')
    and not has_table_privilege('service_role','private.c13_events','select')
    and (select count(*)=4 and bool_and(relrowsecurity) from pg_class where relnamespace='private'::regnamespace and relname like 'c13_%' and relkind='r');`)).toBe("t");
  await call(signedIn,directory,404);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic publication Founder provenance');
    insert into private.verification_reviewers(user_id) values('${evidence.id}'),('${reviewer.id}'),('${challenger.id}'),('${triager.id}');
    insert into feed_data.community_memberships(community_id,user_id) values
      ('${room}','${signedIn.id}'),('${room}','${triager.id}'),('${room}','${peer.id}'),('${other}','${outsider.id}');
    insert into feed_data.community_staff(community_id,user_id,role) values('${room}','${triager.id}','moderator');
    insert into private.c11_intake_fixture values(true,true);
    insert into private.c12_fixture values(true);`);
  const admin = String((await apiCall(founder,"/api/v1/me/private-workflows",200,"POST",{kind:"admin_workspace"})).id);
  const independent = async (person: Member) => String((await apiCall(person,"/api/v1/me/private-workflows",200,"POST",{kind:"verification_workspace"})).id);
  const ew = await independent(evidence), rw = await independent(reviewer), cw = await independent(challenger);
  for (const [person,role] of [[triager,"triage"],[triager,"review"],[evidence,"review"],[reviewer,"review"],[challenger,"review"]] as const) {
    await call(founder,reviews,200,"POST",{action:"grant",role,target:person.id,communityId:room,requestId:randomUUID(),confirmed:true,note},admin);
  }
  const tw = String((await apiCall(triager,"/api/v1/me/private-workflows",200,"POST",{kind:"moderation_workspace"})).id);
  await call(signedIn,directory,404);
  sql("insert into private.c13_fixture values(true);");
  try {
    await call(null,directory,401);
    await call(outsider,directory,404);
    const result = await localClient("AYINOU_E2E_SUPABASE_PUBLIC").rpc("c13_publication_for_api", {
      p_actor: signedIn.id, p_session: randomUUID(), p_aal2: false, p_totp: null, p_workspace: null,
      p_lane: "directory", p_id: null, p_room: room, p_category: null, p_after: null, p_command: null,
    });
    expect(result.error).not.toBeNull();
    const makeCase = async (supported: boolean) => {
      const need = await call<{ id:string }>(signedIn,intake,201,"POST",{communityId:room,content:original});
      const member = intake + "/" + need.id + "/publication";
      await call(signedIn,member,404);
      await call(signedIn,intake+"/"+need.id,200,"PATCH",{action:"submit",expectedRevision:1,confirmed:true});
      const action = (person:Member,lane:string,workspace:string,key:string,revision:number,fields={}) =>
        call<NeedReviewCase>(person,reviews+"/"+need.id+"?lane="+lane,200,"PATCH",
          {action:key,expectedRevision:revision,confirmed:true,requestId:randomUUID(),note,...fields},workspace);
      await action(founder,"admin",admin,"assign_triage",0,{target:triager.id});
      await action(triager,"triage",tw,"refer",1);
      await action(founder,"admin",admin,"assign_review",2,{target:evidence.id});
      await action(evidence,"review",ew,"accept",3,{conflictFree:true});
      const finding = await action(evidence,"review",ew,supported ? "supported" : "not_supported",4,
        {summary:supported ? "evidence_matches" : "conflicting_evidence"});
      expect(finding.state).toBe(supported ? "supported" : "not_supported");
      return { id:need.id, member, status:await call<NeedPublication>(signedIn,member,200) };
    };
    const unsupported=await makeCase(false);
    const receipt=(action:string,expectedRevision:number,fields={}) => ({action,expectedRevision,confirmed:true,requestId:randomUUID(),...fields});
    const request=(status:NeedPublication, revision:number, attribution=false, content=summary) =>
      receipt("request",revision,{audience:"community",attribution,finding:status.finding,expectedEvidenceRevision:status.evidenceRevision,content});
    await call(signedIn,unsupported.member,409,"PATCH",request(unsupported.status,0));
    const need=await makeCase(true);
    expect(need.status.canRequest).toBe(true);
    await call(peer,need.member,404);
    expect((await call<NeedPublicationPage<PublishedNeed>>(peer,directory,200)).items).toEqual([]);
    await call(signedIn,need.member,400,"PATCH",request(need.status,0,false,{...summary,description:"Private contact: person@example.org"}));
    sql(`insert into private.m23_restrictions(subject_id,capability,scope_kind,scope_id,issuer_id,authority,max_minutes,category,starts_at,expires_at)
      values('${signedIn.id}','community_need_submit','community','${room}','${founder.id}','founder',60,'safety',now(),now()+interval '1 hour');`);
    await call(signedIn,need.member,403,"PATCH",request(need.status,0));
    await call(signedIn,need.member,200);
    sql(`update private.m23_restrictions set revoked_at=clock_timestamp() where subject_id='${signedIn.id}' and capability='community_need_submit';`);
    const pending=await call<NeedPublication>(signedIn,need.member,200,"PATCH",request(need.status,0));
    expect(pending.state).toBe("pending");
    const publication=pending.id!;
    const detail=directory+"/"+publication;
    const write=(actor:Member,lane:string,workspace:string,command:object,status:number|number[]=200) =>
      call<NeedPublication>(actor,staff+"/"+publication+"?lane="+lane,status,"PATCH",command,workspace);
    const assign=(target:string,revision:number,challenge=false,expected=200) =>
      write(founder,"admin",admin,receipt(challenge?"assign_challenge":"assign",revision,{target,note}),expected);
    await call(peer,detail,404);
    await write(founder,"admin",admin,receipt("approve",1,{note}),403);
    for(const person of [founder,signedIn,evidence,triager]) await assign(person.id,1,false,403);
    const project=randomUUID();
    sql(`insert into private.community_projects(id,creator_id,owner_user_id,association_id,submission_key,request_digest)
      values('${project}','${reviewer.id}','${reviewer.id}','${room}',gen_random_uuid(),decode('00','hex'));`);
    await assign(reviewer.id,1,false,403);
    sql(`delete from private.community_projects where id='${project}';`);
    await assign(reviewer.id,1);
    await write(reviewer,"review",cw,receipt("approve",2,{note}),403);
    const approve=receipt("approve",2,{note});
    const decisions=await Promise.all([write(reviewer,"review",rw,approve),write(reviewer,"review",rw,approve)]);
    expect(decisions.map((value) => value.revision)).toEqual([3,3]);
    expect(sql(`select count(*) from private.c13_events where publication_id='${publication}' and action='approve';`)).toBe("1");
    const live=await call<PublishedNeed>(peer,detail,200);
    expect(live.content).toEqual(summary);
    expect(live.attribution).toBeNull();
    for(const secret of [privateTitle,need.id,note, "example.org"]) expect(JSON.stringify(live)).not.toContain(secret);
    await call(outsider,detail,404);
    await call(outsider,directory+"?actor="+peer.id,400);
    sql(`insert into private.m22_account_sanctions(subject_id,kind,category,started_at,expires_at)
      values('${peer.id}','suspended','safety',now(),now()+interval '1 hour');`);
    await call(peer,detail,[401,403,404]);
    sql(`update private.m22_account_sanctions set revoked_at=clock_timestamp() where subject_id='${peer.id}';`);
    await call(signedIn,"/api/v1/private/communities/"+other+"/needs/"+publication,404);
    expect((await call<NeedPublicationPage<PublishedNeed>>(peer,directory+"?category=healthcare",200)).items).toEqual([]);
    sql(`delete from feed_data.community_memberships where community_id='${room}' and user_id='${peer.id}';`);
    await call(peer,detail,404);
    sql(`insert into feed_data.community_memberships(community_id,user_id) values('${room}','${peer.id}');`);

    const url="/communities/ouest?need="+publication;
    for(const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{name:"ayinou-locale",value:locale,url:web}]);
      await page.setViewportSize(locale==="en" ? {width:1360,height:900} : {width:390,height:844});
      await page.goto(url);
      await expect(page.getByRole("heading",{name:summary.title})).toBeVisible();
      await expect(page.getByText(publicationLabel(locale,"meaning"))).toBeVisible();
      await expect(page.getByText(privateTitle,{exact:true})).toHaveCount(0);
      expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(locale==="en" ? 1360 : 390);
    }
    await context.addCookies([{name:"ayinou-locale",value:"en",url:web}]);
    await page.goto(url);
    await page.getByRole("button",{name:publicationLabel("en","discuss"),exact:true}).click();
    const discussion=page.getByRole("region",{name:"Discussion",exact:true});
    await expect(discussion).toBeVisible();
    await discussion.getByRole("button",{name:publicationLabel("en","addReference"),exact:true}).click();
    const post=discussion.getByRole("textbox",{name:"Post text",exact:true});
    await expect(post).toHaveValue(url);
    await post.fill("A member discussion about community study resources."+String.fromCharCode(10)+url);
    await discussion.getByRole("button",{name:"Publish",exact:true}).click();
    await expect(discussion.getByText(/A member discussion about community study resources/)).toBeVisible();
    expect(JSON.stringify(await call(null,"/api/v1/communities/ouest/public-posts",403))).not.toContain(publication);

    const revised={...summary,title:"Community learning resources"};
    await call(signedIn,need.member,200,"PATCH",request(need.status,3,true,revised));
    expect((await call<PublishedNeed>(peer,detail,200)).content.title).toBe(summary.title);
    await assign(reviewer.id,4);
    await write(reviewer,"review",rw,receipt("reject",5,{note,reason:"clarity"}));
    const rejected=await call<NeedPublication>(signedIn,need.member,200);
    expect(rejected.history?.find((item)=>item.action==="reject")?.code).toBe("clarity");
    expect(JSON.stringify(rejected)).not.toContain(note);
    sql(`update private.c13_events set happened_at=now()-interval '14 days' where id=(select decision from private.c13_publications where id='${publication}');`);
    await call(signedIn,need.member,409,"PATCH",receipt("challenge",6,{note}));
    sql(`update private.c13_events set happened_at=now() where id=(select decision from private.c13_publications where id='${publication}');`);
    await call(signedIn,need.member,200,"PATCH",receipt("challenge",6,{note}));
    await assign(reviewer.id,7,true,403);
    await assign(challenger.id,7,true);
    await write(challenger,"review",cw,receipt("return",8,{note}));
    expect((await call<PublishedNeed>(peer,detail,200)).content.title).toBe(summary.title);
    // Both prior decision makers are excluded from reconsideration of that revision.
    await assign(reviewer.id,9,false,403);
    await assign(challenger.id,9,false,403);
    // With a thin reviewer roster the case stays pending. The author can withdraw safely.
    await call(signedIn,need.member,200,"PATCH",receipt("withdraw",9));
    await call(peer,detail,404);

    await call(signedIn,need.member,200,"PATCH",request(need.status,10,true,revised));
    await assign(reviewer.id,11);
    await write(reviewer,"review",rw,receipt("approve",12,{note}));
    sql(`insert into public.user_settings(user_id,discoverable) values('${signedIn.id}',true)
      on conflict(user_id) do update set discoverable=true;
      update public.profiles set is_visible=true where user_id='${signedIn.id}';`);
    expect((await call<PublishedNeed>(peer,detail,200)).attribution).toBeTruthy();
    sql(`update public.user_settings set discoverable=false where user_id='${signedIn.id}';`);
    expect((await call<PublishedNeed>(peer,detail,200)).attribution).toBeNull();
    sql(`update public.user_settings set discoverable=true where user_id='${signedIn.id}';`);
    sql(`insert into feed_data.profile_privacy(user_id,mode) values('${signedIn.id}','private')
      on conflict(user_id) do update set mode='private';`);
    expect((await call<PublishedNeed>(peer,detail,200)).attribution).toBeNull();
    sql(`update feed_data.profile_privacy set mode='public' where user_id='${signedIn.id}';`);
    await call(signedIn,need.member,200,"PATCH",receipt("revoke_attribution",13));
    expect((await call<PublishedNeed>(peer,detail,200)).attribution).toBeNull();
    await write(triager,"triage",tw,receipt("hide",14,{note}));
    await call(peer,detail,404);
    await call(signedIn,need.member,200,"PATCH",request(need.status,15));
    await assign(reviewer.id,16);
    await write(reviewer,"review",rw,receipt("approve",17,{note}));
    sql(`update private.c12_cases set state='under_review',finding_id=null where need_id='${need.id}';`);
    await call(peer,detail,404);
    expect((await call<NeedPublication>(signedIn,need.member,200)).state).toBe("stale");
    const correctionNeed=await makeCase(true);
    const first=await call<NeedPublication>(signedIn,correctionNeed.member,200,"PATCH",request(correctionNeed.status,0));
    const correctionPath=staff+"/"+first.id;
    const correct=(person:Member,workspace:string,lane:string,command:object) =>
      call<NeedPublication>(person,correctionPath+"?lane="+lane,200,"PATCH",command,workspace);
    await correct(founder,admin,"admin",receipt("assign",1,{target:reviewer.id,note}));
    await correct(reviewer,rw,"review",receipt("request_correction",2,{note,reason:"privacy"}));
    const requested=await call<NeedPublication>(signedIn,correctionNeed.member,200);
    expect(requested.state).toBe("changes_requested");
    expect(requested.history?.find((item)=>item.action==="request_correction")?.code).toBe("privacy");
    await call(peer,directory+"/"+first.id,404);
    await call(signedIn,correctionNeed.member,200,"PATCH",request(correctionNeed.status,3,false,revised));
    await correct(founder,admin,"admin",receipt("assign",4,{target:reviewer.id,note}));
    await correct(reviewer,rw,"review",receipt("approve",5,{note}));
    await call(peer,directory+"/"+first.id,200);
    await correct(founder,admin,"admin",receipt("remove",6,{note}));
    await call(peer,directory+"/"+first.id,404);
    const inbox=await call<{notifications:unknown[]}>(signedIn,"/api/v1/me/notifications",200);
    expect(JSON.stringify(inbox)).toContain("publication_stale");
    expect(JSON.stringify(inbox)).not.toContain(note);
    expect(JSON.stringify(await call(peer,"/api/v1/me/notifications",200))).not.toContain(need.id);
  } finally {
    sql("delete from private.c13_fixture; delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap;");
  }
});

test("publication directory ignores an old page after a category change", async ({ page, context, signedIn }) => {
  const room = sql("select id from feed_data.communities where slug='ouest';");
  sql("insert into feed_data.community_memberships(community_id,user_id) values ('" + room + "','" + signedIn.id + "');");
  const path = "/api/v1/private/communities/" + room + "/needs";
  const entry = (title: string, category: "education" | "healthcare") => ({
    id: randomUUID(), content: { ...summary, title, category }, publishedAt: new Date().toISOString(), attribution: null,
  });
  const oldPage = entry("Delayed education result", "education");
  const categoryResult = entry("Current healthcare result", "healthcare");
  const first = entry("Initial education result", "education");
  const pending = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
  await page.route((url) => url.pathname === path, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const params = new URL(route.request().url()).searchParams;
    if (params.has("after")) {
      pending.resolve();
      await release.promise;
      await route.fulfill({ response, status: 200, json: { items: [oldPage], nextCursor: null } });
    } else {
      const filtered = params.get("category") === "healthcare";
      await route.fulfill({ response, status: 200, json: { items: [filtered ? categoryResult : first], nextCursor: filtered ? null : first.id } });
    }
  });

  try {
    await page.goto("/communities/ouest");
    await page.getByRole("button", { name: publicationLabel("en", "title"), exact: true }).click();
    const directory = page.getByRole("region", { name: publicationLabel("en", "title"), exact: true });
    const firstResult = directory.getByRole("button", { name: /Initial education result/ });
    await expect(firstResult).toBeVisible();
    await directory.getByRole("combobox").focus();
    await page.keyboard.press("Tab");
    await expect(firstResult).toBeFocused();
    const a11y = await new AxeBuilder({ page }).include('section[aria-label="' + publicationLabel("en", "title") + '"]')
      .withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(a11y.violations).toEqual([]);
    await directory.getByRole("button", { name: /load more/i }).click();
    await pending.promise;
    await directory.getByRole("combobox").selectOption("healthcare");
    await expect(directory.getByRole("button", { name: /Current healthcare result/ })).toBeVisible();
    const completed = page.waitForResponse((response) => response.url().includes("after="));
    release.resolve();
    await (await completed).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(directory.getByText(oldPage.content.title, { exact: true })).toHaveCount(0);
    await expect(directory.getByText(first.content.title, { exact: true })).toHaveCount(0);
  } finally {
    release.resolve();
  }
});
