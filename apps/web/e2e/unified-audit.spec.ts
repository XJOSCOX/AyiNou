import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { AuditPage } from "@ayinou/shared";
import { api, apiCall, expect, localClient, sql, test, totp, type Member } from "./fixtures";

const platform = "/api/v1/admin/audit/events";
const activity = "/api/v1/me/activity";
const secretEvidence = "Synthetic restricted evidence must never appear";
const sessionOf = (member: Member): string => JSON.parse(Buffer.from(member.token.split(".")[1], "base64url").toString()).session_id;
const orgActivity = (id: string) => "/api/v1/institutions/" + id + "/activity";
const reviewActivity = (id: string) => "/api/v1/verification/cases/" + id + "/activity";

async function send(member: Member, route: string, status: number, workspace?: string) {
  const response = await fetch(api + route, {
    headers: { Authorization: "Bearer " + member.token, ...(workspace && { "X-Ayinou-Workspace": workspace }) },
    signal: AbortSignal.timeout(8_000),
  });
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(JSON.stringify(data)).not.toContain(secretEvidence);
  return data;
}

async function recent(member: Member) {
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  const signIn = async () => {
    const login = await client.auth.signInWithPassword({ email: member.email, password: member.password });
    expect(login.error).toBeNull();
  };
  await signIn();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  if (factor.error) throw factor.error;
  const elevate = async (): Promise<Member> => {
    const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.data.id, code: totp(factor.data.totp.secret) });
    if (result.error) throw result.error;
    return { ...member, token: result.data.access_token };
  };
  const elevated = await elevate();
  return { member: elevated, another: async () => { await signIn(); return elevate(); } };
}

async function workflow(member: Member, kind: "admin_workspace" | "verification_workspace") {
  return (await apiCall(member, "/api/v1/me/private-workflows", 200, "POST", { kind })).id as string;
}

test("A1A platform audit rechecks Founder, Administrator, MFA, clock and workspace on every page @smoke", async ({ makeMember }) => {
  test.setTimeout(90_000);
  const [first, second, subject] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  const [founder, other] = await Promise.all([recent(first), recent(second)]);
  const leader = founder.member, admin = other.member;
  const bootEvent = randomUUID(), statusEvent = randomUUID(), proposalEvent = randomUUID(), proposalResource = randomUUID();
  sql(`begin;
    insert into private.platform_bootstrap(user_id) values ('${leader.id}');
    insert into public.role_assignments(user_id,role) values ('${admin.id}','administrator');
    insert into private.platform_admin_audit(id,subject_id,event,reason) values
     ('${bootEvent}','${leader.id}','first_account_bootstrapped','${secretEvidence}'),
     ('${statusEvent}','${subject.id}','account_suspended','${secretEvidence}');
    insert into private.platform_governance_events(id,scope,resource_id,actor_id,subject_id,action,version,reason,outcome)
     values ('${proposalEvent}','proposal','${proposalResource}','${leader.id}','${subject.id}','propose',1,'${secretEvidence}',
       jsonb_build_object('authorizationMode','founder_direct','private','${secretEvidence}'));
    commit;`);
  try {
    const [f, a] = await Promise.all([workflow(leader, "admin_workspace"), workflow(admin, "admin_workspace")]);
    await send(subject, platform, 404, a);
    await send(second, platform, 404, a);
    await send(admin, platform, 404, f);
    const secondary = await other.another();
    await send(secondary, platform, 404, a);
    const privateEvent = "governance:" + proposalEvent;
    const proposal = await send(leader, platform + "/" + privateEvent, 200, f);
    expect(proposal).toMatchObject({ reference: privateEvent, authority: "founder", sourceVersion: 1, outcome: "recorded",
      reasonCode: null, previousState: null, newState: null });
    await send(admin, platform + "/" + privateEvent, 404, a);
    await send(admin, platform + "/invalid", 404, a);
    await send(admin, platform + "/platform_admin:" + randomUUID(), 404, a);
    await send(admin, platform + "/platform_admin:" + bootEvent, 404, a);
    expect((await send(admin, platform + "?resource=" + subject.id, 200, a)).events)
      .toContainEqual(expect.objectContaining({ sourceEventId: statusEvent, actorRef: null, sourceVersion: null }));
    expect((await send(admin, platform + "?resource=" + randomUUID(), 200, a)).events).toEqual([]);
    expect((await send(leader, platform + "?actor=" + leader.id + "&category=governance", 200, f)).events)
      .toContainEqual(expect.objectContaining({ reference: privateEvent }));
    const path = platform + "?limit=1";
    const firstPage: AuditPage = await send(leader, path, 200, f);
    expect(firstPage.nextCursor).toBeTruthy();
    const resume = path + "&cursor=" + firstPage.nextCursor;
    await send(admin, resume, 400, a);
    const tampered = resume.replace(/(cursor=)(.)/, (_, prefix: string, first: string) => prefix + (first === "x" ? "y" : "x"));
    await send(leader, tampered, 400, f);
    await send(leader, resume + "&category=platform", 400, f);
    await send(leader, platform + "?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z", 400, f);
    const newEvent = randomUUID();
    sql(`insert into private.platform_admin_audit(id,subject_id,event,reason)
      values ('${newEvent}','${subject.id}','account_suspended','${secretEvidence}');`);
    const next: AuditPage = await send(leader, resume, 200, f);
    expect(next.events).toHaveLength(1);
    expect(next.events[0].reference).not.toBe(firstPage.events[0].reference);
    expect(next.events[0].sourceEventId).not.toBe(newEvent);

    const adminPage: AuditPage = await send(admin, path, 200, a);
    expect(adminPage.nextCursor).toBeTruthy();
    sql(`delete from public.role_assignments where user_id='${admin.id}' and role='administrator';`);
    await send(admin, path + "&cursor=" + adminPage.nextCursor, 404, a);
    sql(`update auth.sessions set created_at=now()-interval '6 hours 1 minute' where id='${sessionOf(leader)}';`);
    await send(leader, resume, 404, f);
    sql(`update auth.sessions set created_at=now() where id='${sessionOf(leader)}';
      update private.s2a_session_policy set revoked_at=now() where session_id='${sessionOf(leader)}';`);
    await send(leader, resume, 404, f);
    const fresh = await founder.another();
    const live = await workflow(fresh, "admin_workspace");
    sql(`insert into private.account_restrictions(user_id,status,reason)
      values ('${leader.id}','suspended','${secretEvidence}');`);
    await send(fresh, platform, 404, live);
    expect(sql(`select not has_table_privilege('authenticated','private.a1a_audit_source','select')
        and not has_table_privilege('service_role','private.a1a_audit_source','select')
        and exists(select from pg_proc where proname='a1a_audit_for_api' and prosecdef
          and has_function_privilege('service_role',oid,'execute') and not has_function_privilege('authenticated',oid,'execute')
          and not has_function_privilege('anon',oid,'execute'))
        and not has_table_privilege('authenticated','private.poll_ballots','select');`)).toBe("t");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${leader.id}';
      delete from public.role_assignments where user_id='${admin.id}' and role='administrator';`);
  }
});

test("A1A member, organization and assigned review histories stay isolated and redact raw records @smoke", async ({ makeMember }) => {
  test.setTimeout(90_000);
  const [member, manager, candidate, applicant] = await Promise.all(Array.from({ length: 4 }, () => makeMember()));
  const worker = (await recent(candidate)).member;
  const own = randomUUID(), foreign = randomUUID(), caseId = randomUUID();
  const orgRows = [own, foreign].map((id) => `('${id}','audit-${id.slice(0, 12)}','Audit fixture','ngo','HT','${manager.id}')`).join(",");
  sql(`begin;
    insert into private.organizations(id,handle,name,kind,country_code,created_by) values ${orgRows};
    insert into private.organization_memberships(organization_id,user_id,role) values ('${own}','${manager.id}','owner');
    insert into private.organization_role_audit(organization_id,actor_id,event,before_state)
    values ('${own}','${member.id}','role_created',jsonb_build_object('secret','${secretEvidence}')),
           ('${foreign}','${member.id}','role_created',jsonb_build_object('secret','${secretEvidence}'));
    insert into private.verification_reviewers(user_id) values ('${worker.id}');
    insert into private.verification_applications(id,applicant_id,kind) values ('${caseId}','${applicant.id}','identity');
    insert into private.verification_reviews(application_id,reviewer_id,decision,rationale)
      values ('${caseId}','${member.id}','approve','${secretEvidence}');
    commit;`);
  try {
    const page: AuditPage = await send(member, activity + "?category=security&limit=1", 200);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ source: "session_policy", resourceRef: null, actorRef: null, authority: null });
    expect(JSON.stringify(page)).not.toContain(sessionOf(member));
    await send(member, activity + "?actor=" + manager.id, 400);
    await send(member, orgActivity(own), 404);
    await send(manager, orgActivity(foreign), 404);
    const org: AuditPage = await send(manager, orgActivity(own), 200);
    expect(org.events).toEqual([expect.objectContaining({ organizationRef: own, actorRef: null, newState: null, previousState: null })]);

    const ref = await workflow(worker, "verification_workspace");
    await send(worker, reviewActivity(caseId), 404, ref);
    await apiCall(worker, "/api/v1/verification/review/" + caseId + "/work", 204, "PATCH", { claim: true });
    const decision: AuditPage = await send(worker, reviewActivity(caseId) + "?outcome=approved", 200, ref);
    expect(decision.events).toEqual([expect.objectContaining({
      resourceRef: caseId, outcome: "approved", actorRef: null, authority: null,
    })]);
    await send(worker, reviewActivity(randomUUID()), 404, ref);
    await send(applicant, reviewActivity(caseId), 404, ref);
    await apiCall(worker, "/api/v1/verification/review/" + caseId + "/work", 204, "PATCH", { claim: false });
    await send(worker, reviewActivity(caseId), 404, ref);
    sql(`update private.organization_memberships set revoked_at=now() where organization_id='${own}' and user_id='${manager.id}';`);
    await send(manager, orgActivity(own), 404);
  } finally {
    sql(`delete from private.verification_reviewers where user_id='${worker.id}';`);
  }
});

test("A1A indexed page bounds and read budgets hold across 50,000 older events", async ({ makeMember }) => {
  test.setTimeout(70_000);
  const person = await makeMember(), other = await makeMember();
  sql(`insert into private.s2a_session_events(user_id,event,occurred_at)
    select case when n%25=0 then '${person.id}'::uuid else '${other.id}'::uuid end,
      'issued',clock_timestamp()-(n::text||' seconds')::interval
    from generate_series(1,50000) n;
    analyze private.s2a_session_events;`);
  const begin = performance.now();
  try {
    const page: AuditPage = await send(person, activity + "?category=security&limit=50", 200);
    const after = performance.now();
    expect(page.events).toHaveLength(50);
    expect(page.nextCursor).toBeTruthy();
    const later: AuditPage = await send(person, activity + "?category=security&limit=50&cursor=" + page.nextCursor, 200);
    const complete = performance.now();
    expect(new Set([...page.events, ...later.events].map((event) => event.reference)).size).toBe(100);
    expect(complete - begin).toBeLessThan(3000);
    console.log(`A1A disposable benchmark, 50,000 source events, 2,000 owned: first ${Math.round(after-begin)}ms, next ${Math.round(complete-after)}ms`);
    await send(person, activity + "?limit=51", 400);
    sql(`update feed_data.read_limits set total=30,window_started=date_trunc('minute',clock_timestamp())+interval '1 minute'
      where subject='member:${person.id}' and category='audit';`);
    await send(person, activity, 429);
  } finally {
    sql(`delete from private.s2a_session_events where user_id in ('${person.id}','${other.id}') and policy_ref is null and event='issued';`);
  }
});

test("A1A reconciles a concurrent moderation decision and excludes department or group events", async ({ makeMember }) => {
  const [actor, author] = await Promise.all([makeMember(), makeMember()]);
  const moderator = (await recent(actor)).member;
  const post = randomUUID(), departmentPost = randomUUID();
  const staffPath = "/api/v1/moderation/posts/" + post;
  const auditPath = "/api/v1/moderation/post/" + post + "/activity";
  sql(`begin;
    insert into public.role_assignments(user_id,role) values ('${moderator.id}','moderator');
    insert into feed_data.posts(id,author_id,body,language,visibility,status)
      values ('${post}','${author.id}','${secretEvidence}','en','public','published');
    insert into feed_data.posts(id,author_id,body,language,visibility,status,community_id)
      select '${departmentPost}','${author.id}','${secretEvidence}','en','members_only','published',id
      from feed_data.communities limit 1;
    insert into feed_data.post_moderation_actions(post_id,actor_id,action,reason)
      values ('${departmentPost}','${moderator.id}','hide','${secretEvidence}');
    commit;`);
  try {
    const decision = { action: "hide", version: 1, reason: secretEvidence };
    const decide = () => fetch(api + staffPath, {
      method: "PATCH", headers: { Authorization: "Bearer " + moderator.token, "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });
    const both = await Promise.all([decide(), decide()]);
    expect(both.map((response) => response.status).sort()).toEqual([204, 409]);
    expect((await decide()).status).toBe(409);
    expect(sql(`select status||':'||version from feed_data.posts where id='${post}';`)).toBe("hidden:2");
    const event = sql(`select id from feed_data.post_moderation_actions where post_id='${post}';`);
    const projected: AuditPage = await send(moderator, auditPath, 200);
    expect(projected.events).toEqual([expect.objectContaining({ reference: "post_moderation:" + event, eventType: "hide", actorRef: null })]);
    expect((await send(moderator, "/api/v1/moderation/post/" + departmentPost + "/activity", 200)).events).toEqual([]);
    await send(author, auditPath, 404);
    sql(`delete from public.role_assignments where user_id='${moderator.id}' and role='moderator';`);
    await send(moderator, auditPath, 404);
  } finally {
    sql(`delete from public.role_assignments where user_id='${moderator.id}' and role='moderator';`);
  }
});
