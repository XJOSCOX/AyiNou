import { randomUUID } from "node:crypto";
import { volunteerDepartments } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, sql, test, totp, web, type Member } from "./fixtures";
import { recruitmentCopy } from "../src/lib/recruitment-i18n";

const inbox = "/api/v1/me/volunteer-recruitment";
const admin = "/api/v1/admin/volunteer-settings/recruitment";
const workspacePath = "/settings/volunteering/invitations";
const fixture = "insert into private.c31_fixture values(true); insert into private.c32_fixture values(true); insert into private.c33_fixture values(true); insert into private.c34_fixture values(true);";
const close = "delete from private.c34_fixture; delete from private.c33_fixture; delete from private.c32_fixture; delete from private.c31_fixture;";
const requestData = (expectedVersion = 0) => ({ requestId: randomUUID(), expectedVersion });
const json = JSON.stringify;
const message = "Would you like to help lead a reading session next month?";

async function call(path: string, member?: Member, body?: object, method = body ? "PATCH" : "GET", workspace?: string, base = api) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method, signal: AbortSignal.timeout(12_000),
    headers: { ...(member ? { Authorization: "Bearer " + member.token } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      ...(workspace ? { "X-Ayinou-Workspace": workspace } : {}) },
    ...(body ? { body: json(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cache: response.headers.get("cache-control"), ms: Math.round(performance.now() - start) };
}

async function checked(status: number | number[], ...args: Parameters<typeof call>) {
  const response = await call(...args);
  expect([status].flat(), args[0] + " " + json(response.data)).toContain(response.status);
  return response.data;
}

function readyMember(member: Member, options: { discovery?: boolean; supporter?: boolean } = {}) {
  finishPersonalOnboarding(member);
  sql(`update public.profiles set is_visible=true where user_id='${member.id}';
    insert into public.user_settings(user_id,discoverable) values('${member.id}',true)
      on conflict(user_id) do update set discoverable=true;
    insert into private.c31_profiles values('${member.id}',1,'Private volunteer rehearsal summary',
      '[{"code":"ht","proficiency":"advanced"}]','hybrid','four_eight','{}',true,'available',current_date+40);
    insert into private.c31_selections values('${member.id}','literacy_tutoring','advanced',4);
    insert into private.c31_consents(actor,matching,discovery,profile_display) values('${member.id}',true,${options.discovery ?? true},true);
    insert into feed_data.community_memberships(community_id,user_id)
      select id,'${member.id}' from feed_data.communities where kind='department' on conflict do nothing;`);
  if (options.supporter) sql(`update public.member_private set membership_category='international_supporter' where user_id='${member.id}';`);
}

function verify(organizer: Member, reviewer: Member) {
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${organizer.id}','identity','verified','review','${reviewer.id}',now());`);
}

type Opportunity = { project: string; id: string; work: string; recruitment: string; discovery: string };
function seedOpportunity(organizer: Member, { department = "HT-OU", mode = "remote", screening = false,
  ownership = "individual", association = "" } = {}): Opportunity {
  const project = randomUUID(), id = randomUUID();
  const body = { mode, hoursPerWeek: 3, durationWeeks: 2, beginnerFriendly: false, screening,
    skills: [{ code: "literacy_tutoring", priority: "required", proficiency: "intermediate", experienceMin: 1, experienceMax: null }],
    languages: [{ code: "ht", priority: "required", proficiency: "intermediate" }] };
  const field = ownership === "community" ? "community_id" : ownership === "organization" ? "organization_id" : "owner_user_id";
  const owner = ownership === "community" ? `(select id from feed_data.communities where department_code='${department}')`
    : `'${association || organizer.id}'`;
  sql(`insert into private.community_projects(id,creator_id,${field},submission_key,request_digest,status,
    submitted_by,submitted_at,approved_at,directory_published_at) values('${project}','${organizer.id}',${owner},
      gen_random_uuid(),'c34','approved','${organizer.id}',now(),now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${organizer.id}',jsonb_build_object('title','Neighborhood reading project','country','HT','department','${department}','category','education','publishRequested',true));
    insert into private.project_execution(project_id,approved_revision,status,operator_id) values('${project}',1,'active','${organizer.id}');
    insert into private.project_opportunities(id,project_id,manager_id,title,description,skills,commitment,remote,capacity,closes_on)
      values('${id}','${project}','${organizer.id}','Reading session','Support a rehearsal reading session.','Reading','Three hours',${mode !== "on_site"},1,current_date+14);
    insert into private.c32_requirements(project,opportunity,version,action,snapshot,actor,request,fingerprint)
      values('${project}','${id}',1,'publish',private.c32_snapshot('${json(body)}',private.c32_settings(),1,
        '${department}',1,current_date+14,${mode !== "on_site"}),'${organizer.id}',gen_random_uuid(),'c34');`);
  const work = "/api/v1/projects/" + project + "/work";
  const path = work + "/requirements/" + id;
  return { project, id, work, recruitment: path + "/recruitment", discovery: path + "/candidates" };
}

async function selected(target: Opportunity, organizer: Member, volunteer: Member) {
  let cursor: string | null = null;
  for (let index = 0; index < 3; index++) {
    const path = target.discovery + (cursor ? "?" + new URLSearchParams({ cursor }) : "");
    const candidates = await checked(200, path, organizer);
    const entry = candidates.items.find((item: { handle: string }) => item.handle === volunteer.handle);
    if (entry) {
      expect(entry.selection).toEqual(expect.any(String));
      return entry.selection as string;
    }
    cursor = candidates.nextCursor;
    if (!cursor) break;
  }
  throw new Error("Expected the eligible fixture volunteer within the bounded discovery pages.");
}

const changeContact = (member: Member, allowed: boolean, version = 0) =>
  checked(200, inbox + "/preferences", member, { ...requestData(version), allowed });

const native = (target: Opportunity, member: Member, action: string, fields: object) =>
  checked(200, target.work, member, { action, ...fields }, "POST");

test("manual scoped invitations use separate consent and the native application lifecycle", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(120_000);
  const organizer = signedIn, volunteer = await makeMember({ visible: true }), outsider = await makeMember({ visible: true });
  readyMember(organizer);
  readyMember(volunteer, { supporter: true });
  readyMember(outsider, { discovery: false });
  verify(organizer, volunteer);
  const target = seedOpportunity(organizer);
  const unrelated = seedOpportunity(organizer, { mode: "hybrid" });
  const screened = seedOpportunity(organizer, { screening: true });
  expect(await checked(200, inbox, volunteer)).toMatchObject({ state: "closed", items: [] });
  expect((await call(inbox, volunteer)).cache).toContain("no-store");
  await checked(401, inbox);
  await checked(403, admin, outsider);
  expect(sql(`select count(*)=5 and bool_and(relrowsecurity and not has_table_privilege('authenticated',oid,'select,insert,update,delete')
    and not has_table_privilege('service_role',oid,'select,insert,update,delete')) from pg_class
    where relnamespace='private'::regnamespace and relkind='r' and relname like 'c34_%';`)).toBe("t");
  expect(sql(`select not has_function_privilege('authenticated','public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)','execute');`)).toBe("t");
  sql(fixture);
  try {
    const selection = await selected(target, organizer, volunteer);
    await checked(400, target.recruitment + "/preview", organizer, { handle: volunteer.handle }, "POST");
    await checked(403, target.recruitment + "/preview", organizer, { selection }, "POST");
    expect(await checked(200, inbox + "/preferences", volunteer)).toMatchObject({ allowed: false, version: 0 });
    await changeContact(volunteer, true);
    await changeContact(outsider, true);
    expect((await checked(200, screened.discovery, organizer)).items).toEqual([]);
    const preview = await checked(200, target.recruitment + "/preview", organizer, { selection }, "POST");
    expect(preview).toMatchObject({ title: "Reading session", revision: 1, department: "HT-OU" });
    expect(json(preview)).not.toContain("Private volunteer");
    await checked(400, unrelated.recruitment + "/preview", organizer, { selection }, "POST");
    await checked(400, target.recruitment + "/preview", outsider, { selection }, "POST");

    const send = { ...requestData(), selection, message };
    const results = await Promise.all([call(target.recruitment, organizer, send, "POST"), call(target.recruitment, organizer, send, "POST")]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(results[0].data).toEqual(results[1].data);
    const id = results[0].data.id as string;
    await checked(409, target.recruitment, organizer, { ...send, requestId: randomUUID() }, "POST");
    await checked(403, inbox + "/" + id, outsider);
    expect(sql(`select (select count(*) from private.project_applications where opportunity_id='${target.id}')=0
      and (select count(*) from private.project_team where project_id='${target.project}')=0;`)).toBe("t");
    const notices = await checked(200, "/api/v1/me/notifications", volunteer);
    expect(notices.notifications.find((item: { recruitment?: { id: string } }) => item.recruitment?.id === id)).toMatchObject({
      kind: "volunteer_recruitment", actor: null, recruitment: { id, status: "pending" },
    });
    expect(json(notices)).not.toContain(message);
    await inEnglish(context);
    await login(page, volunteer);
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      const width = locale === "en" ? 1440 : 390;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(workspacePath + "/" + id);
      await expect(page.getByRole("heading", { name: "Reading session" })).toBeVisible();
      await expect(page.getByRole("link", { name: recruitmentCopy(locale)("apply") })).toBeVisible();
      expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width);
    }
    const app = await native(target, volunteer, "volunteer_apply", { id: target.id });
    expect(app.id).toEqual(expect.any(String));
    expect(await checked(200, inbox + "/" + id, volunteer)).toMatchObject({ status: "application_initiated", terms: null, message: null });
    expect(sql(`select application::text from private.c34_invitations where id='${id}';`)).toBe(app.id);
    const report = { ...requestData(2), action: "report", category: "privacy", explanation: "Disposable test of reporting an invitation to project moderation." };
    await checked(403, inbox + "/" + id, outsider, report);
    expect(await checked(200, inbox + "/" + id, volunteer, report)).toMatchObject({ version: 3 });
    expect(await checked(200, inbox + "/" + id, volunteer, report)).toMatchObject({ version: 3 });
    expect(await checked(200, inbox + "/" + id, volunteer)).toMatchObject({ reported: true });
    expect(sql(`select count(*) from private.project_reports where project_id='${target.project}' and reporter_id='${volunteer.id}';`)).toBe("1");
    await native(target, organizer, "volunteer_offer", { id: app.id, reason: "Thank you for applying to this rehearsal." });
    await native(target, volunteer, "volunteer_confirm", { id: app.id });
    await changeContact(volunteer, false, 1);
    expect(sql(`select exists(select from private.project_team where project_id='${target.project}'
      and user_id='${volunteer.id}' and role='volunteer' and revoked_at is null);`)).toBe("t");
  } finally { sql(close); }
});


test("invalidation is durable across consent, blocks, capacity, revision and delegated authority changes", async ({ signedIn, makeMember }) => {
  test.setTimeout(180_000);
  const organizer = signedIn, volunteer = await makeMember({ visible: true }), filler = await makeMember({ visible: true });
  [organizer, volunteer, filler].forEach(member => readyMember(member));
  verify(organizer, volunteer);
  const organization = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)
    values('${organization}','c34-disposable-ngo','Neighborhood learning association','ngo','HT','verified','${organizer.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${organizer.id}','owner');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${organizer.id}','${organization}','organization','approved',now());
    insert into feed_data.community_staff(community_id,user_id,role) select id,'${organizer.id}','administrator'
      from feed_data.communities where kind='department';`);
  const community = seedOpportunity(organizer, { department: "HT-NI", mode: "on_site", ownership: "community" });
  const organized = seedOpportunity(organizer, { mode: "hybrid", ownership: "organization", association: organization });
  const regional = volunteerDepartments.map(department => seedOpportunity(organizer, { department }));
  sql(fixture);
  const pauseCooldown = () => sql(`update private.c34_invitations set changed_at=now()-interval '31 days',created_at=now()-interval '32 days'
    where organizer='${organizer.id}' and status<>'pending';`);
  const send = async (target: Opportunity) => {
    const selection = await selected(target, organizer, volunteer);
    const result = await checked(200, target.recruitment, organizer, { ...requestData(), selection, message }, "POST");
    return result.id as string;
  };
  const open = (id: string) => checked(200, inbox + "/" + id, volunteer);
  try {
    await changeContact(volunteer, true);
    expect(sql(`select count(distinct t->>'department') from private.project_opportunities o
      cross join lateral private.c34_terms(o.project_id,o.id,1,'${organizer.id}','${volunteer.id}') t
      where o.manager_id='${organizer.id}' and t is not null;`)).toBe("10");
    const consentId = await send(community);
    await changeContact(volunteer, false, 1);
    await changeContact(volunteer, true, 2);
    expect(await open(consentId)).toMatchObject({ status: "invalidated", terms: null, message: null });
    const cooldownSelection = await selected(organized, organizer, volunteer);
    await checked(409, organized.recruitment, organizer, { ...requestData(), selection: cooldownSelection, message }, "POST");
    pauseCooldown();

    const roleId = await send(organized);
    sql(`update private.organization_memberships set revoked_at=now() where organization_id='${organization}';`);
    expect(await open(roleId)).toMatchObject({ status: "invalidated", terms: null, message: null });
    pauseCooldown();

    const declineId = await send(regional[0]);
    const mutation = { ...requestData(1), action: "decline" };
    const declined = await checked(200, inbox + "/" + declineId, volunteer, mutation);
    expect(await checked(200, inbox + "/" + declineId, volunteer, mutation)).toMatchObject({ version: declined.version });
    expect(await open(declineId)).toMatchObject({ status: "declined" });
    await checked(200, inbox + "/" + declineId, volunteer, { ...requestData(2), action: "dismiss" });
    expect((await checked(200, inbox, volunteer)).items.some((item: { id: string }) => item.id === declineId)).toBe(false);
    pauseCooldown();

    const withdrawalId = await send(regional[1]);
    const [withdraw, decline] = await Promise.all([
      checked(200, inbox + "/" + withdrawalId, organizer, { ...requestData(1), action: "withdraw" }),
      checked(200, inbox + "/" + withdrawalId, volunteer, { ...requestData(1), action: "decline" }),
    ]);
    expect([withdraw, decline].filter(data => data.changed)).toHaveLength(1);
    expect(["declined", "withdrawn"]).toContain((await open(withdrawalId)).status);
    pauseCooldown();

    const blockId = await send(regional[2]);
    sql(`insert into feed_data.member_blocks(actor_id,target_id) values('${volunteer.id}','${organizer.id}');
      delete from feed_data.member_blocks where actor_id='${volunteer.id}' and target_id='${organizer.id}';`);
    expect(await open(blockId)).toMatchObject({ status: "invalidated", terms: null });
    pauseCooldown();

    const senderBlockId = await send(regional[3]);
    sql(`insert into feed_data.member_blocks(actor_id,target_id) values('${organizer.id}','${volunteer.id}');
      delete from feed_data.member_blocks where actor_id='${organizer.id}' and target_id='${volunteer.id}';`);
    expect(await open(senderBlockId)).toMatchObject({ status: "invalidated", terms: null });
    pauseCooldown();

    const exhaustedId = await send(regional[4]);
    const applied = await native(regional[4], filler, "volunteer_apply", { id: regional[4].id });
    await native(regional[4], organizer, "volunteer_offer", { id: applied.id, reason: "Fill the remaining spot for this rehearsal." });
    expect(await open(exhaustedId)).toMatchObject({ status: "invalidated", terms: null });
    pauseCooldown();

    const staleId = await send(regional[5]);
    const staleSelection = await selected(regional[5], organizer, volunteer);
    sql(`insert into private.c32_requirements(project,opportunity,version,action,snapshot,actor,request,fingerprint)
      select project,opportunity,2,action,snapshot||'{"hoursPerWeek":5}',actor,gen_random_uuid(),'revised'
      from private.c32_requirements where opportunity='${regional[5].id}' and version=1;`);
    expect(await open(staleId)).toMatchObject({ status: "invalidated", terms: null });
    await checked(403, regional[5].recruitment + "/preview", organizer, { selection: staleSelection }, "POST");
    pauseCooldown();

    const closeId = await send(regional[6]);
    await native(regional[6], organizer, "opportunity_close", { id: regional[6].id });
    expect(await open(closeId)).toMatchObject({ status: "invalidated", terms: null });
    expect((await checked(200, regional[6].recruitment, organizer)).items).toEqual([expect.objectContaining({ id: closeId, status: "invalidated" })]);
    pauseCooldown();

    const expireId = await send(regional[7]);
    sql(`update private.c34_invitations set expires_at=now()-interval '1 second' where id='${expireId}';`);
    expect(await open(expireId)).toMatchObject({ status: "expired", terms: null });
    pauseCooldown();

    const discoveryId = await send(regional[8]);
    sql(`update private.c31_consents set discovery=false where actor='${volunteer.id}';
      update private.c31_consents set discovery=true where actor='${volunteer.id}';`);
    expect(await open(discoveryId)).toMatchObject({ status: "invalidated", terms: null });
    pauseCooldown();

    const associated = seedOpportunity(organizer, { department: "HT-CE" });
    sql(`update private.community_projects set association_id=(select id from feed_data.communities where department_code='HT-CE')
      where id='${associated.project}';`);
    const associatedChoice = await send(associated);
    sql(`delete from feed_data.community_memberships where community_id=(select id from feed_data.communities where department_code='HT-CE')
      and user_id='${volunteer.id}';
      insert into feed_data.community_memberships(community_id,user_id) select id,'${volunteer.id}' from feed_data.communities where department_code='HT-CE';`);
    expect(await open(associatedChoice)).toMatchObject({ status: "invalidated", terms: null });
    pauseCooldown();

    const restrictionsId = await send(regional[9]);
    sql(`insert into private.account_restrictions(user_id,status,reason) values('${organizer.id}','suspended','Disposable standing scenario');
      delete from private.account_restrictions where user_id='${organizer.id}';`);
    expect(await open(restrictionsId)).toMatchObject({ status: "invalidated", terms: null });
  } finally { sql(close); }
});

test("Founder preparation remains usable through the original workspace while recruitment is closed", async ({ signedIn, makeMember }) => {
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const key = await enroll(founder);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await client.auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
    const factors = (await client.auth.mfa.listFactors()).data!.totp;
    const mfa = await client.auth.mfa.challengeAndVerify({ factorId: factors[0].id, code: totp(key) });
    const staff = { ...founder, token: mfa.data!.access_token };
    const workspace = (await checked(200, "/api/v1/me/private-workflows", staff, { kind: "admin_workspace" }, "POST")).id;
    await checked(403, admin, signedIn, undefined, "GET", workspace);
    await checked(403, admin, staff, undefined, "GET", randomUUID());
    const initial = await checked(200, admin, staff, undefined, "GET", workspace);
    expect(initial.settings).toMatchObject({ version: 0, organizerDailyLimit: 5, departments: [...volunteerDepartments] });
    const command = { ...initial.settings, version: undefined, action: "configure", ...requestData(),
      confirmed: true, expiryDays: 3, reason: "Prepare short invitations while recruitment stays closed." };
    await checked(400, admin, staff, { ...command, enabled: true }, "PATCH", workspace);
    await checked(400, admin, staff, { ...command, organizerDailyLimit: 200 }, "PATCH", workspace);
    expect(await checked(200, admin, staff, command, "PATCH", workspace)).toEqual({ version: 1 });
    expect(await checked(200, admin, staff, command, "PATCH", workspace)).toEqual({ version: 1 });
    await checked(409, admin, staff, { ...command, requestId: randomUUID() }, "PATCH", workspace);
    expect(await checked(200, inbox, staff)).toMatchObject({ state: "closed", items: [] });
  } finally {
    sql(`delete from private.c34_configuration; delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});


test("bounded reads, rate limits and cross-process retries with 1,000 historical invitations", async ({ signedIn, makeMember }) => {
  test.setTimeout(120_000);
  const organizer = signedIn, volunteers = [await makeMember({ visible: true }), await makeMember({ visible: true }), await makeMember({ visible: true })];
  [organizer, ...volunteers].forEach(member => readyMember(member));
  verify(organizer, volunteers[0]);
  const target = seedOpportunity(organizer);
  const another = seedOpportunity(organizer);
  sql(fixture);
  try {
    for (const member of volunteers) await changeContact(member, true);
    sql(`insert into private.c34_configuration(version,settings,actor,workspace,request,fingerprint,reason)
      values(1,private.c34_defaults()||'{"opportunityDailyLimit":2,"organizerDailyLimit":3,"recipientDailyLimit":1}',
        '${organizer.id}',gen_random_uuid(),gen_random_uuid(),'fixture','Disposable bounded recruitment limits');
      insert into private.c34_invitations(project,opportunity,requirement,organizer,recipient,message,status,created_at,expires_at,changed_at)
      select '${target.project}','${target.id}',1,'${organizer.id}','${volunteers[0].id}','Historical synthetic invitation','expired',
        now()-interval '40 days',now()-interval '33 days',now()-interval '33 days' from generate_series(1,1000);
      analyze private.c34_invitations;`);
    const reads = [];
    for (let sample=0; sample<3; sample++) {
      const response = await call(inbox, volunteers[0]);
      expect(response.status).toBe(200);
      expect(response.data.items).toHaveLength(20);
      expect(response.data.nextCursor).toEqual(expect.any(String));
      reads.push({ ms: response.ms, bytes: Buffer.byteLength(json(response.data)) });
    }
    const sent = await checked(200, target.recruitment, organizer);
    expect(sent.items).toHaveLength(20);
    await checked(400, inbox + "?cursor=" + sent.nextCursor, volunteers[0]);

    const firstSelection = await selected(target, organizer, volunteers[0]);
    const body = { ...requestData(), selection: firstSelection, message };
    const [first, retry] = await Promise.all([
      call(target.recruitment, organizer, body, "POST"),
      call(target.recruitment, organizer, body, "POST", undefined, "http://127.0.0.1:5301"),
    ]);
    expect([first.status, retry.status]).toEqual([200, 200]);
    expect(first.data.id).toBe(retry.data.id);
    const secondSelection = await selected(target, organizer, volunteers[1]);
    const second = await call(target.recruitment, organizer, { ...requestData(), selection: secondSelection, message }, "POST");
    expect(second.status).toBe(200);
    const excess = await selected(target, organizer, volunteers[2]);
    await checked(429, target.recruitment, organizer, { ...requestData(), selection: excess, message }, "POST");
    const thirdSelection = await selected(another, organizer, volunteers[2]);
    const third = await call(another.recruitment, organizer, { ...requestData(), selection: thirdSelection, message }, "POST");
    expect(third.status).toBe(200);
    expect(sql(`select count(*) from private.c34_invitations where organizer='${organizer.id}' and status='pending';`)).toBe("3");

    const plan = sql(`explain (analyze,buffers) select id from private.c34_invitations where recipient='${volunteers[0].id}'
      and id>'00000000-0000-0000-0000-000000000000' order by id limit 21;`);
    expect(plan).toMatch(/Index|Bitmap/);
    console.log("C3.4 benchmark " + json({ history: 1000, reads, sendMs: [first.ms, second.ms, third.ms], parallelRetryMs: retry.ms,
      planner: plan.split(/\r?\n/).filter(line => /Index|Execution Time/.test(line)) }));
  } finally {
    sql("delete from private.c34_configuration;");
    sql(close);
  }
});
