import { randomUUID } from "node:crypto";
import { featureCapabilities, type FeatureEnforcementCase, type FeatureEnforcementPage } from "@ayinou/shared";
import { featureMessages } from "../src/lib/feature-enforcement-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, logout, solveMfa, sql, test, totp, type Member } from "./fixtures";

const endpoint = "/api/v1/moderation/feature-enforcement";
const reason = "Private synthetic moderation test narrative";

async function elevate(member: Member) {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing test factor");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token, secret };
}

const workspace = async (actor: Member, kind = "admin_workspace") =>
  (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind })).id as string;

function payload(subject: Member, fields: object = {}) {
  return { requestId: randomUUID(), subject: subject.id, action: "restrict", capabilities: ["post"],
    scope: "platform", scopeId: null, minutes: 60, category: "safety", reason, confirmed: true, ...fields };
}

async function request(actor: Member, workspaceId?: string, body?: object, path = endpoint) {
  const response = await fetch(api + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + actor.token, ...(workspaceId && { "X-Ayinou-Workspace": workspaceId }),
      ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, data: await response.json() };
}

async function command(actor: Member, workspaceId: string, status: number, body: object): Promise<FeatureEnforcementCase[]> {
  const result = await request(actor, workspaceId, body);
  expect(result.status, JSON.stringify(result.data)).toBe(status);
  return result.data.records;
}

const post = (body: string) => ({ body, language: "en", visibility: "public" });
const eventInput = (organizationId: string | null = null) => ({
  version: null, request: randomUUID(), organizationId, communityId: null, projectId: null, title: "Synthetic event",
  description: "Disposable restriction fixture", category: "education", format: "online", visibility: "public",
  startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 90_000_000).toISOString(),
  timeZone: "UTC", country: null, department: null, locality: null, venue: null, meetingUrl: null,
  coverUrl: null, capacity: null, language: "en",
});

test("M2.3 enforces authority, scope and duration on live writes @smoke", async ({ makeMember, page, context }) => {
  test.setTimeout(120_000);
  const [owner, second, reviewer, subject, other] = await Promise.all(
    Array.from({ length: 5 }, () => makeMember({ visible: true })));
  for (const member of [owner, second, reviewer, subject, other]) finishPersonalOnboarding(member);
  const [founder, admin, mod] = await Promise.all([owner, second, reviewer].map(elevate));
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into public.role_assignments(user_id,role) values('${admin.id}','administrator'),('${mod.id}','moderator');`);
  try {
    const f = await workspace(founder), a = await workspace(admin);
    expect(await request(mod, undefined, undefined, endpoint + "/access")).toMatchObject({ status: 200, data: { allowed: false } });
    expect((await request(mod, a)).status).toBe(403);
    expect((await request(founder, a)).status).toBe(403);
    expect((await request(second, a)).status).toBe(401);
    await command(admin, a, 403, payload(founder));
    await command(founder, f, 403, payload(admin));
    await command(admin, a, 400, payload(subject, { minutes: 129601 }));
    await command(admin, a, 409, payload(subject, { minutes: null }));
    await command(admin, a, 403, payload(subject, { indefinite: true, minutes: null }));
    await command(admin, a, 403, payload(subject, { capabilities: ["poll_manage"] }));
    const [high] = await command(founder, f, 200, payload(other, { capabilities: ["poll_manage"], minutes: null, indefinite: true }));
    expect(high).toMatchObject({ authority: "founder", expiresAt: null });
    await command(founder, f, 403, payload(mod, { action: "delegate", capabilities: ["poll_manage"], maxMinutes: 60 }));

    const [longTerm] = await command(admin, a, 200, payload(other, { capabilities: ["event_create"], minutes: 129600 }));
    expect(Date.parse(longTerm.expiresAt!) - Date.parse(longTerm.startsAt)).toBe(90 * 86400000);
    const [grant] = await command(admin, a, 200, payload(mod, { action: "delegate", maxMinutes: 10080, minutes: null }));
    const m = await workspace(mod, "moderation_workspace");
    expect(await request(mod, undefined, undefined, endpoint + "/access")).toMatchObject({ status: 200, data: { allowed: true } });
    expect((await request(mod, m)).data.authority).toBe("moderator");
    await inEnglish(context);
    await login(page, mod);
    await solveMfa(page, mod.secret);
    await page.goto("/admin?section=featureRestrictions");
    await page.getByRole("button", { name: featureMessages.en.moderationEntry, exact: true }).click();
    await expect(page).toHaveURL(/\/s\/[^/]+\/moderation/);
    await expect(page.getByRole("heading", { name: featureMessages.en.features, exact: true }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: featureMessages.en.delegations, exact: true })).toHaveCount(0);
    await logout(page);
    await command(mod, m, 403, payload(mod, { action: "delegate", maxMinutes: 60 }));
    await command(mod, m, 403, payload(subject, { capabilities: ["media"] }));
    await command(mod, m, 409, payload(subject, { minutes: 10081 }));
    const original = (await apiCall(subject, "/api/v1/posts", 201, "POST", post("Existing public post"))).id;
    const writes = await Promise.all([request(mod, m, payload(subject)), request(admin, a, payload(subject))]);
    expect(writes.map((result) => result.status).sort()).toEqual([200, 409]);
    const [active] = writes.find((result) => result.status === 200)!.data.records as FeatureEnforcementCase[];
    expect((await apiCall(subject, "/api/v1/posts", 403, "POST", post("New post blocked"))).error.code).toBe("FEATURE_RESTRICTED");
    await apiCall(other, "/api/v1/posts/" + original, 200);
    await apiCall(subject, "/api/v1/members/" + other.handle + "/follow", 200, "PUT");
    const noticesClient = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await noticesClient.auth.signInWithPassword({ email: subject.email, password: subject.password })).error).toBeNull();
    const { data, error } = await noticesClient.rpc("m23_my_feature_notices");
    expect(error).toBeNull();
    expect(data).toEqual([expect.objectContaining({ id: active.id, capability: "post", status: "active", category: "safety" })]);
    expect(JSON.stringify(data)).not.toContain(reason);
    await command(admin, a, 200, payload(mod, { action: "revoke_delegation", reference: grant.id, version: grant.version, minutes: null }));
    expect((await request(mod, m)).status).toBe(403);
    await apiCall(subject, "/api/v1/posts", 403, "POST", post("New post still blocked"));
    await command(admin, a, 200, payload(subject, { action: "revoke", reference: active.id, version: active.version, minutes: null }));
    await command(admin, a, 409, payload(subject));
    await apiCall(subject, "/api/v1/posts", 201, "POST", post("Posting restored"));

    const organizationHandle = "m23-" + randomUUID().slice(0, 8);
    const organization = sql(`with inserted as (insert into private.organizations(handle,name,kind,country_code,created_by)
      values('${organizationHandle}','Restriction test organization','nonprofit','HT','${subject.id}') returning id) select id from inserted;`);
    sql(`insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${subject.id}','owner');`);
    const event = (await apiCall(subject, "/api/v1/events", 200, "POST", eventInput(organization))).event;
    const eventPath = "/api/v1/events/" + event.id;
    await apiCall(subject, eventPath + "/status", 200, "POST", { version: event.version, status: "published" });
    await apiCall(other, eventPath + "/rsvp", 200, "PUT", { response: "going", listMe: true });
    const [rsvp] = await command(admin, a, 200, payload(other, { capabilities: ["event_rsvp"], scope: "organization", scopeId: organization }));
    await command(admin, a, 409, payload(other, { capabilities: ["event_rsvp"], scope: "event", scopeId: event.id }));
    await apiCall(other, eventPath + "/rsvp", 200, "PUT", { response: null, listMe: false });
    await apiCall(other, eventPath + "/rsvp", 403, "PUT", { response: "going", listMe: false });
    const directRsvp = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await directRsvp.auth.signInWithPassword({ email: other.email, password: other.password })).error).toBeNull();
    expect((await directRsvp.rpc("rsvp_event_for_client", { p_id: event.id, p_response: "going", p_list_me: false })).error?.code).toBe("M2301");
    const [timedGrant] = await command(admin, a, 200, payload(mod, {
      action: "delegate", capabilities: ["event_rsvp"], maxMinutes: 90, minutes: 60, scope: "event", scopeId: event.id,
    }));
    const timedWorkspace = await workspace(mod, "moderation_workspace");
    await command(mod, timedWorkspace, 403, payload(other, { capabilities: ["event_rsvp"] }));
    sql(`update private.m23_delegations set starts_at=now()-interval '1 hour',expires_at=now()-interval '1 second'
      where id='${timedGrant.id}';`);
    expect((await request(mod, timedWorkspace)).status).toBe(403);
    const direct = await localClient("AYINOU_E2E_SUPABASE_PUBLIC").rpc("m23_access_for_api", { p_actor: subject.id });
    expect(direct.error).not.toBeNull();
    sql(`update private.m23_restrictions set starts_at=now()-interval '2 hours',expires_at=now()-interval '1 second' where id='${rsvp.id}';`);
    await apiCall(other, eventPath + "/rsvp", 200, "PUT", { response: "going", listMe: false });
    const report = await request(admin, a, undefined, "/api/v1/admin/moderation-center?view=history&domain=features");
    expect(report.status, JSON.stringify(report.data)).toBe(200);
    expect(report.data.rows).toContainEqual(expect.objectContaining({ action: "feature_expired", caseReference: rsvp.id }));
    expect(JSON.stringify(report.data)).not.toContain(reason);
    expect(sql(`select count(*) from private.a1a_audit_source where event_type='feature_expired'
      and new_state->>'caseReference'='${rsvp.id}';`)).toBe("1");

    const draft = await apiCall(founder, "/api/v1/polls", 201, "POST", {
      title: "Protected ballot", description: "Disposable fixture for independent voting rights.", scope: "individual",
      scopeId: null, taskId: null, policy: "advisory", kind: "community", language: "en", audience: "members",
      eligibility: "active", resultPolicy: "after_vote", opensAt: new Date(Date.now() + 180000).toISOString(),
      closesAt: new Date(Date.now() + 360000).toISOString(), quorum: null, threshold: null, options: ["One", "Two"], key: randomUUID(),
    });
    const pollPath = "/api/v1/polls/" + draft.id;
    await apiCall(founder, pollPath + "/transition", 200, "POST", { action: "publish", version: draft.version });
    const option = sql(`update private.polls set opens_at=now()-interval '5 seconds' where id='${draft.id}';
      select id from private.poll_options where poll_id='${draft.id}' order by position limit 1;`).split("\n").at(-1);
    await apiCall(other, pollPath + "/ballot", 200, "POST", { optionId: option });
    expect(await apiCall(other, pollPath + "/ballot", 200)).toMatchObject({ optionId: option });
    expect(await apiCall(subject, pollPath + "/ballot", 200)).toEqual({ optionId: null });

    const orgPost = { organization: organizationHandle, body: "Organization notice", language: "en" };
    const socialPath = "/api/v1/posts/social";
    const publishedOrgPost = await apiCall(subject, socialPath, 201, "POST", orgPost);
    const personalEvent = (await apiCall(subject, "/api/v1/events", 200, "POST", eventInput())).event;
    const personalEventPath = "/api/v1/events/" + personalEvent.id;
    await apiCall(subject, personalEventPath + "/status", 200, "POST", { version: personalEvent.version, status: "published" });
    const allOtherCapabilities = featureCapabilities.filter((cap) => cap !== "post");
    const granted = await command(founder, f, 200, payload(subject, { capabilities: allOtherCapabilities }));
    expect(granted).toHaveLength(allOtherCapabilities.length);
    expect((await apiCall(subject, socialPath, 403, "POST", orgPost)).error.code).toBe("FEATURE_RESTRICTED");
    await apiCall(other, "/api/v1/posts/" + publishedOrgPost.id, 200);
    const share = { submission: randomUUID(), body: "Event notice", language: "en" };
    expect((await apiCall(subject, personalEventPath + "/share", 403, "POST", share)).error.code).toBe("FEATURE_RESTRICTED");
    const community = sql("select id from feed_data.communities where kind = 'department' limit 1;");
    const blockedWrites = [
      `insert into feed_data.comments(author_id, post_id, body, language) values('${subject.id}','${original}','Reply','en')`,
      `insert into feed_data.post_reactions(user_id, post_id, kind) values('${subject.id}','${original}','like')`,
      `insert into feed_data.reposts(actor_id, post_id) values('${subject.id}','${original}')`,
      `insert into feed_data.social_mentions(post_id,token,member_id) values('${original}','@${other.handle}','${other.id}')`,
      `insert into feed_data.post_attachments(id,author_id,state) values(gen_random_uuid(),'${subject.id}','uploading')`,
      `insert into private.organizations(created_by) values('${subject.id}')`,
      `insert into private.verification_applications(applicant_id,organization_id,kind) values('${subject.id}','${organization}','representative')`,
      `insert into private.organization_invitations(invited_by,organization_id) values('${subject.id}','${organization}')`,
      `insert into feed_data.posts(author_id,organization_id) values('${subject.id}','${organization}')`,
      `insert into feed_data.events(creator_id) values('${subject.id}')`,
      `update feed_data.events set title='Blocked edit' where id='${event.id}'`,
      `insert into feed_data.event_updates(author_id,event_id) values('${subject.id}','${event.id}')`,
      `insert into feed_data.communities(slug) values('blocked-group')`,
      `insert into feed_data.posts(author_id,community_id) values('${subject.id}','${community}')`,
      `insert into feed_data.group_audit(community_id,actor_id,action) values('${community}','${subject.id}','invite')`,
      `insert into private.community_projects(creator_id) values('${subject.id}')`,
      `insert into private.project_progress_entries(author_id,project_id,kind) values('${subject.id}',gen_random_uuid(),'update')`,
      `insert into private.project_operations_events(actor_id,project_id,action) values('${subject.id}',gen_random_uuid(),'volunteer_apply')`,
      `insert into private.project_operations_events(actor_id,project_id,action) values('${subject.id}',gen_random_uuid(),'task_create')`,
      `insert into private.polls(creator_id) values('${subject.id}')`,
      `insert into private.poll_options(poll_id,nominee_id) values(gen_random_uuid(),'${other.id}')`,
      `insert into private.poll_decisions(poll_id,actor_id) values(gen_random_uuid(),'${subject.id}')`,
    ];
    sql(`do $$ begin
      perform set_config('request.jwt.claim.sub', '${subject.id}', true);
      ${blockedWrites.map((statement) => `begin ${statement}; raise exception 'missing feature guard: %', $write$${statement}$write$;
        exception when sqlstate 'M2301' then null; end;`).join("\n")}
    end $$;`);
    await apiCall(subject, "/api/v1/posts", 201, "POST", post("Personal posting remains available"));

    const suite = (await request(founder, f, undefined, endpoint + "?q=" + subject.handle)).data as FeatureEnforcementPage;
    expect(suite.capabilities.map(({ key }) => key).sort()).toEqual([...featureCapabilities].sort());
    expect(suite.subjects).toEqual([expect.objectContaining({ id: subject.id, username: subject.handle })]);
    await inEnglish(context);
    await login(page, subject);
    await page.goto("/account-access");
    const languages = page.getByRole("combobox").last();
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await languages.selectOption(locale);
      await expect(page.getByRole("heading", { name: featureMessages[locale].features, exact: true })).toBeVisible();
    }
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${owner.id}';
      delete from public.role_assignments where user_id in ('${second.id}','${reviewer.id}');`);
  }
});
