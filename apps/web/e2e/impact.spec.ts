import { randomUUID } from "node:crypto";
import { performance as clock } from "node:perf_hooks";
import { impactDepartments, type ImpactMapping, type ImpactOverview, type ImpactResponse, type MemberOutcomeReview, type OutcomePage, type OutcomePublication, type OutcomeSource, type PublicOutcomeResult } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";
import { impactCopy } from "../src/lib/impact-i18n";
import { rehearsalSql, verifyImpactRecovery } from "./impact-rehearsal";

const publicPath = "/api/v1/impact";
const founderPath = "/api/v1/admin/impact";
const reviewerPath = "/api/v1/private/impact-review";
const memberPath = "/api/v1/me/impact/mappings/";
const note = "The synthetic delivery and its reporting scope were independently reviewed.";
const year = 2025;

async function recent(person: Member) {
  const secret = await enroll(person);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: person.email, password: person.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw Error("Expected verifier in disposable project");
  const session = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (session.error) throw session.error;
  return { ...person, token: session.data.access_token };
}

async function request<T>(path: string, expected: number | number[], actor?: Member, workspace?: string, body?: object, method?: string): Promise<T> {
  const response = await fetch(api + path, { method: method ?? (body ? "PATCH" : "GET"), body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    headers: { ...(actor && { Authorization: "Bearer " + actor.token }), ...(workspace && { "X-Ayinou-Workspace": workspace }),
      ...(body && { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }) },
  });
  const payload = await response.json();
  expect([expected].flat(), path + (response.ok ? "" : " " + JSON.stringify(payload))).toContain(response.status);
  if (path.startsWith(publicPath) || path.startsWith(founderPath) || path.startsWith(reviewerPath) || path.startsWith(memberPath)) {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  return payload as T;
}

const receipt = (action: string, expectedVersion: number, more: object = {}) =>
  ({ action, expectedVersion, requestId: randomUUID(), reason: note, confirmed: true, ...more });

function seedProject(owner: Member, department: string, sector: string, kind: "individual" | "organization" | "community" = "individual") {
  const project = randomUUID(), organization = randomUUID();
  const setup = kind === "organization" ? `insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)
    values('${organization}','impact-${organization.slice(0,8)}','Impact exercise organization','ngo','HT','verified','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${owner.id}','owner');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${owner.id}','${organization}','organization','approved',now());` : kind === "community" ?
    `insert into feed_data.community_memberships(community_id,user_id)
       select id,'${owner.id}' from feed_data.communities where department_code='${department}' and kind='department'
       on conflict (community_id,user_id) do nothing;
     insert into feed_data.community_staff(community_id,user_id,role)
       select id,'${owner.id}','administrator' from feed_data.communities where department_code='${department}' and kind='department';` : "";
  const authority = kind === "individual" ? ["owner_user_id", "'" + owner.id + "'"] : kind === "organization" ?
    ["organization_id", "'" + organization + "'"] : ["community_id", "(select id from feed_data.communities where department_code='" + department + "' and kind='department')"];
  sql(`${setup}
    insert into private.community_projects(id,creator_id,${authority[0]},submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      values('${project}','${owner.id}',${authority[1]},gen_random_uuid(),'x','approved','${owner.id}',now(),now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${owner.id}',jsonb_build_object('title','Synthetic impact project',
        'category','${sector}','country','HT','department','${department}','objectives','A disposable impact exercise',
        'references',jsonb_build_array(),'description','Project for testing impact reporting'));
    insert into private.project_execution(project_id,approved_revision,status,operator_id) values('${project}',1,'completed','${owner.id}');
    insert into private.project_operations_events(project_id,actor_id,action,detail,created_at)
      values('${project}','${owner.id}','execution_status','completed','${year}-12-31 12:00+00');`);
  return project;
}

function seedDisclosure(owner: Member, reviewer: Member, project: string, department: string,
  classification: string, quantity: number | null, reported: number, unit = "desks") {
  const metric = randomUUID(), source = randomUUID(), caseId = randomUUID(), finding = randomUUID(), publication = randomUUID();
  const measurement = quantity === null ? "null" : `jsonb_build_object('quantity',${quantity},'unit','${unit}',
    'startsOn','${year}-01-01','endsOn','${year}-12-31','methodology','SIGNED_DESK_HANDOVER_V1')`;
  sql(`insert into private.project_metrics(id,project_id,creator_id,name,unit,target)
     values('${metric}','${project}','${owner.id}','Observation ${source.slice(0,8)}','${unit}',8);
    insert into private.project_metric_observations(id,project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference)
      values('${source}','${project}','${metric}','${owner.id}','${year}-01-01','${year}-12-31',${reported},
        'The accepted observations cover the selected year','https://example.org/synthetic-source');
    insert into private.c21_outcome_requests(id,project_id,requester_id,source_kind,source_id,source_revision,source_fingerprint,
      result,classification,explanation,status,revision,created_at,submitted_at)
      select '${caseId}',p.id,'${owner.id}','observation',s.id,s.revision,repeat('0',64),s.result,'output',
        'The recorded delivery covers the approved year','submitted',2,now(),now()
      from private.community_projects p cross join lateral private.c21_sources(p,'${owner.id}','owner','observation','${source}',null,1) s
      where p.id='${project}';
    insert into private.c22_cases(id,department,state) values('${caseId}','${department}','decided');
    insert into private.c22_revisions(case_id,revision,submitted_revision,result,manifest,explanation)
      select id,1,revision,result-'evidence',result->'evidence','Synthetic evidence' from private.c21_outcome_requests where id='${caseId}';
    insert into private.c22_releases(case_id,revision,generation) values('${caseId}',1,1);
    insert into private.c22_findings(id,case_id,revision,release_generation,reviewer,lane,classification,explanation,limitations,measurement,available_at)
      values('${finding}','${caseId}',1,1,'${reviewer.id}','initial','${classification}','Private review',
        'The accepted evidence covers the recorded year.',${measurement},now()-interval '15 days');
    insert into private.c23_publications(id,case_id,project_id,department,finding_id,project_revision,state,consent_hash,approved_at)
      values('${publication}','${caseId}','${project}','${department}','${finding}',1,'approved',decode(repeat('a',64),'hex'),now());
    insert into private.c23_disclosures(publication_id,revision,finding_id,snapshot,fingerprint)
      select '${publication}',1,f.id,private.c23_snapshot(r,f,jsonb_build_object('title','Synthetic result','summary','A reviewed delivery',
        'limitations','Limited to the reporting year','includeReported',true),false),decode(repeat('a',64),'hex')
      from private.c21_outcome_requests r join private.c22_findings f on f.case_id=r.id where r.id='${caseId}';`);
  return { source, caseId, finding, publication, project, owner };
}

async function createLinkedImpactProject(owner: Member, author: Member, founder: Member,
  triager: Member, reviewer: Member, publisher: Member, associationReviewer: Member,
  admin: string, year: number) {
  const intake = "/api/v1/me/community-needs";
  const reviews = "/api/v1/private/community-needs-review";
  const publications = "/api/v1/private/community-need-publications";
  const links = "/api/v1/private/need-project-links";
  const room = sql("select id from feed_data.communities where slug='centre';");
  sql(`insert into private.verification_reviewers(user_id) values
    ('${triager.id}'),('${reviewer.id}'),('${publisher.id}'),('${associationReviewer.id}');
    insert into feed_data.community_memberships(community_id,user_id) values('${room}','${triager.id}');
    insert into feed_data.community_staff(community_id,user_id,role) values('${room}','${triager.id}','moderator');`);
  const workspace = async (actor: Member, kind: string) =>
    (await request<{ id: string }>("/api/v1/me/private-workflows", 200, actor, undefined, { kind }, "POST")).id;
  const command = (action: string, expectedRevision: number, fields = {}) =>
    ({ action, expectedRevision, ...fields, requestId: randomUUID(), confirmed: true });
  const [reviewSpace, publishSpace, associationSpace] = await Promise.all([
    workspace(reviewer, "verification_workspace"), workspace(publisher, "verification_workspace"),
    workspace(associationReviewer, "verification_workspace"),
  ]);
  for (const [actor, role] of [[triager, "triage"], [triager, "review"], [reviewer, "review"],
    [publisher, "review"], [associationReviewer, "review"]] as const) {
    await request(reviews, 200, founder, admin,
      { action: "grant", role, target: actor.id, communityId: room, note, requestId: randomUUID(), confirmed: true }, "POST");
  }
  const triageSpace = await workspace(triager, "moderation_workspace");
  const summary = { title: "Desks for the community reading room", description: "Document the furniture needed for scheduled reading hours.",
    category: "education", area: "centre", beneficiaries: "Local learners" };
  const { id: need } = await request<{ id: string }>(intake, 201, author, undefined, { communityId: room,
    content: { ...summary, references: [{ url: "https://example.org/reading-room", description: "Synthetic site assessment" }] } }, "POST");
  const needPath = intake + "/" + need;
  await request(needPath, 200, author, undefined, { action: "submit", expectedRevision: 1, confirmed: true });
  const review = (actor: Member, space: string, lane: string, action: string, version: number, fields = {}) =>
    request(reviews + "/" + need + "?lane=" + lane, 200, actor, space, command(action, version, { ...fields, note }));
  await review(founder, admin, "admin", "assign_triage", 0, { target: triager.id });
  await review(triager, triageSpace, "triage", "refer", 1);
  await review(founder, admin, "admin", "assign_review", 2, { target: reviewer.id });
  await review(reviewer, reviewSpace, "review", "accept", 3, { conflictFree: true });
  await review(reviewer, reviewSpace, "review", "supported", 4, { summary: "evidence_matches" });
  const publicationRoute = needPath + "/publication";
  const state = await request<{ finding: string; evidenceRevision: number }>(publicationRoute, 200, author);
  const { id: publication } = await request<{ id: string }>(publicationRoute, 200, author, undefined,
    command("request", 0, { audience: "community", attribution: false, finding: state.finding,
      expectedEvidenceRevision: state.evidenceRevision, content: summary }));
  await request(publications + "/" + publication + "?lane=admin", 200, founder, admin,
    command("assign", 1, { target: publisher.id, note }));
  await request(publications + "/" + publication + "?lane=review", 200, publisher, publishSpace, command("approve", 2, { note }));

  const projects = "/api/v1/projects";
  const { id: project } = await request<{ id: string }>(projects, 201, owner, undefined, {
    kind: "individual", owner: null, association: null, proposal: {
      title: "Centre reading room furniture", description: "Provide reading spaces with documented deliveries.",
      problem: "The reading room lacks enough furniture.", solution: "Organize desks and record their handover.",
      objectives: "Equip the community reading room for scheduled learning hours.", beneficiaries: "Local learners",
      outcomes: "The room has documented, usable desks.", category: "education", country: "HT", department: "HT-CE",
      startDate: null, endDate: null, references: [], publishRequested: true,
    },
  }, "POST");
  const projectPath = projects + "/" + project;
  const { version: submitted } = await request<{ version: number }>(projectPath + "/submit", 200, owner, undefined, { version: 1 }, "POST");
  const { version: assigned } = await request<{ version: number }>(projectPath + "/review", 200, founder, undefined,
    { version: submitted, action: "assign", reason: note }, "POST");
  const preview = await request<{ approval: { proof: string } }>(projectPath + "?preview=review", 200, founder);
  const { version: approved } = await request<{ version: number }>(projectPath + "/review", 200, founder, undefined,
    { version: assigned, action: "approve", reason: note, previewProof: preview.approval.proof }, "POST");
  const { version: published } = await request<{ version: number }>(projectPath + "/publication", 200, owner, undefined, { version: approved, publish: true });
  const { id: link } = await request<{ id: string }>(links, 200, owner, undefined, {
    project, projectVersion: published, publication, reason: "The documented desks support the published reading room need.",
    requestId: randomUUID(), confirmed: true,
  }, "POST");
  await request(links + "/" + link + "?lane=member", 200, author, undefined, command("consent", 1));
  await request(links + "/" + link + "?lane=admin", 200, founder, admin,
    command("assign", 2, { target: associationReviewer.id, reason: note }));
  await request(links + "/" + link + "?lane=review", 200, associationReviewer, associationSpace,
    command("approve", 3, { reason: note, relationshipConfirmed: true }));

  const work = (body: object) => request(projectPath + "/work", 200, owner, undefined, body, "POST");
  const progress = <T>(section: string, body: object) => request<T>(projectPath + "/progress/" + section, 200, owner, undefined, body, "POST");
  await work({ action: "execution_status", status: "active", version: 0 });
  await work({ action: "task_create", title: "Check the desk delivery", description: "Record the accepted delivery.",
    priority: "normal", sensitive: false, dueOn: null });
  await progress("milestones", { action: "milestone_create", key: randomUUID(), title: "Prepare the reading room",
    description: "Make space for documented deliveries.", startsOn: null, targetOn: null, target: null,
    unit: null, displayOrder: 0, publicRequested: false, responsibleId: null });
  const metric = await progress<{ id: string }>("metrics", { action: "metric_create", name: "Recorded desk deliveries", unit: "desks", target: 6 });
  const observation = await progress<{ id: string }>("metrics", { action: "metric_observe", id: metric.id,
    startsOn: year + "-01-01", endsOn: year + "-12-31", actual: 6, explanation: "The synthetic register listed six desk deliveries.",
    reference: "https://example.org/desk-register" });
  await work({ action: "execution_status", status: "completed", version: 1 });
  // The test models an earlier calendar year. Preserve the native completion command and audit record.
  sql(`update private.project_operations_events set created_at='${year}-12-31 12:00+00'
    where project_id='${project}' and action='execution_status' and detail='completed';`);
  return { project, source: observation.id, need: { id: link, author } };
}

async function publishReviewedObservation(project: string, source: string, year: number, owner: Member, founder: Member, publisher: Member,
  evidence: Member, challenger: Member, publicationAdmin: string) {
  const reviews = "/api/v1/private/project-outcome-review";
  const publications = "/api/v1/private/project-outcome-publication";
  const projectPath = "/api/v1/projects/" + project;
  const outcomes = projectPath + "/outcome-validation";
  const command = (action: string, expectedVersion: number, fields: object = {}) =>
    ({ action, expectedVersion, ...fields, requestId: randomUUID(), note, confirmed: true });
  const open = async (path: string, actor: Member, lane: "admin" | "review") =>
    (await request<{ id: string }>(path + "/workspace", 200, actor, undefined, { lane }, "POST")).id;
  const reviewAdmin = await open(reviews, founder, "admin");
  const ends = new Date(Date.now() + 86_400_000).toISOString();
  for (const [actor, purpose] of [[evidence, "initial"], [challenger, "challenge"]] as const) {
    await request(reviews + "/roster", 200, founder, reviewAdmin, command("grant", 0,
      { purpose, department: "HT-CE", target: actor.id, expiresAt: ends }), "POST");
  }
  await request(publications + "/roster", 200, founder, publicationAdmin, command("grant", 0,
    { department: "HT-CE", target: publisher.id, expiresAt: ends }), "POST");
  const evidenceWorkspace = await open(reviews, evidence, "review");
  const challengeWorkspace = await open(reviews, challenger, "review");
  const publicationWorkspace = await open(publications, publisher, "review");

  const sources = await request<OutcomePage<OutcomeSource>>(outcomes + "/sources?sourceKind=observation", 200, owner);
  const exact = sources.items.find((item) => item.id === source)!;
  const draft = await request<{ id: string }>(outcomes, 201, owner, undefined, {
    sourceKind: "observation", sourceId: source, sourceRevision: exact.revision, sourceFingerprint: exact.fingerprint,
    classification: "output", explanation: "Review the desk delivery against the original register.",
  }, "POST");
  const caseId = draft.id;
  const ownerReview = outcomes + "/" + caseId + "/review";
  const staff = (path: string, action: string, version: number, actor: Member, workspace: string,
    lane: "admin" | "review", data: object = {}) => request<{ version: number }>(path + "?lane=" + lane, 200,
      actor, workspace, command(action, version, data));
  const response = (action: string, version: number, fields: object = {}) =>
    request<{ version: number }>(ownerReview, 200, owner, undefined, command(action, version, fields));
  await request(outcomes + "/" + caseId, 200, owner, undefined, { action: "submit", expectedRevision: 1, confirmed: true });
  const staffCase = reviews + "/" + caseId;
  const endsAssignment = new Date(Date.now() + 3_600_000).toISOString();
  const assigned = await staff(staffCase, "assign", 1, founder, reviewAdmin, "admin",
    { target: evidence.id, expiresAt: endsAssignment });
  const accepted = await staff(staffCase, "accept", assigned.version, evidence, evidenceWorkspace, "review", { conflictFree: true });
  const released = await response("release_evidence", accepted.version);
  await request(staffCase + "/evidence?expectedVersion=" + released.version, 200, evidence, evidenceWorkspace);
  const finding = await staff(staffCase, "finding", released.version, evidence, evidenceWorkspace, "review", {
    classification: "partially_supported", limitations: "The independently checked register supports zero verified desks.",
    measurement: { quantity: 0, unit: "desks", startsOn: year + "-01-01", endsOn: year + "-12-31", methodology: "SIGNED_DESK_HANDOVER_V1" },
  });
  const decided = await request<MemberOutcomeReview>(ownerReview, 200, owner);
  const challenged = await response("challenge", finding.version, { findingId: decided.findings[0].id });
  const challenge = await staff(staffCase, "assign", challenged.version, founder, reviewAdmin, "admin",
    { target: challenger.id, expiresAt: endsAssignment });
  const reviewing = await staff(staffCase, "accept", challenge.version, challenger, challengeWorkspace, "review", { conflictFree: true });
  await request(staffCase + "/evidence?expectedVersion=" + reviewing.version, 200, challenger, challengeWorkspace);
  await staff(staffCase, "uphold", reviewing.version, challenger, challengeWorkspace, "review");
  expect((await request<MemberOutcomeReview>(ownerReview, 200, owner)).findings[0].challenge?.resolution).toBe("upheld");
  const memberPublication = outcomes + "/" + caseId + "/publication";
  const pending = await request<{ version: number }>(memberPublication, 200, owner, undefined, command("draft", 0, {
    findingId: decided.findings[0].id, content: { title: "Independently reviewed desk deliveries",
      summary: "The sampled records cover the stated reporting year.", limitations: "Only documented deliveries are counted.", includeReported: true },
  }));
  const preview = await request<OutcomePublication>(memberPublication, 200, owner);
  const consented = await request<{ version: number }>(memberPublication, 200, owner, undefined,
    command("submit", pending.version, { fingerprint: preview.fingerprint }));
  const publication = (await request<OutcomePublication>(memberPublication, 200, owner)).id!;
  const publicationCase = publications + "/" + publication;
  const delegated = await staff(publicationCase, "assign", consented.version, founder, publicationAdmin, "admin",
    { target: publisher.id, expiresAt: endsAssignment });
  const taken = await staff(publicationCase, "accept", delegated.version, publisher, publicationWorkspace, "review", { conflictFree: true });
  const inspected = await staff(publicationCase, "inspect", taken.version, publisher, publicationWorkspace, "review");
  await staff(publicationCase, "approve", inspected.version, publisher, publicationWorkspace, "review", { faithful: true });
  const projection = await request<PublicOutcomeResult[]>(projectPath + "/validated-results", 200);
  expect(projection).toHaveLength(1);
  expect(projection[0]).toMatchObject({ title: "Independently reviewed desk deliveries", supportedQuantity: 0 });
  return { source, caseId, finding: decided.findings[0].id, publication, project, owner };
}

function seedNeedAssociation(author: Member, organizer: Member, reviewer: Member, project: string, kind: string) {
  const need = randomUUID(), finding = randomUUID(), publication = randomUUID(), proposal = randomUUID(), association = randomUUID();
  const community = "(select id from feed_data.communities where department_code='HT-CE' and kind='department')";
  sql(`
    insert into private.c11_needs(id,community_id,author_id,status,content)
      values('${need}',${community},'${author.id}','submitted','{"title":"Private association marker"}');
    insert into private.c12_events(id,need_id,community_id,actor_id,action,state,case_revision,evidence_revision)
      values('${finding}','${need}',${community},'${reviewer.id}','supported','supported',1,1);
    insert into private.c12_cases(need_id,state,reviewer,finding_id) values('${need}','supported','${reviewer.id}','${finding}');
    insert into private.c13_publications(id,need_id,state,published_at) values('${publication}','${need}','published',now());
    insert into private.c13_events(id,publication_id,actor,revision,action,state,finding,evidence_revision,content,audience,attribution)
      values('${proposal}','${publication}','${author.id}',1,'request','published','${finding}',1,
        '{"title":"Private association marker"}','community',false);
    update private.c13_publications set live_proposal='${proposal}' where id='${publication}';
    insert into private.c14_links(id,project_id,publication_id,publication_snapshot,project_revision,initiated_version,
      organizer,author,organizer_authority,purpose,reviewer,state,activated_at)
      values('${association}','${project}','${publication}','${proposal}',1,1,'${organizer.id}','${author.id}',
        '${kind}','The reviewed need and project have a common objective','${reviewer.id}','approved',now());`);
  return { id: association, author };
}

test("C2.4 seals safe impact slices across all departments and permanently suppresses invalidated inputs", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(300_000);
  await page.goto("/impact");
  for (const locale of ["en", "ht", "fr", "es"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.setViewportSize({ width: locale === "en" ? 1440 : 390, height: 844 });
    await page.reload();
    await expect(page.getByText(impactCopy(locale)("closed"), { exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(locale === "en" ? 1440 : 390);
  }
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
  expect((await request<ImpactResponse>(publicPath, 200)).state).toBe("disabled");
  await request(founderPath, [403,404], signedIn);

  expect(sql(`select (select count(*)=8 and bool_and(relrowsecurity) from pg_class where relnamespace='private'::regnamespace
    and relname like 'c24_%' and relkind='r') and not exists(select from pg_class c
    cross join unnest(array['anon','authenticated','service_role','authenticator']) roles(role)
    where c.relnamespace='private'::regnamespace and c.relname like 'c24_%' and c.relkind='r'
      and has_table_privilege(roles.role,c.oid,'select,insert,update,delete'))
    and not has_function_privilege('anon','public.c24_impact_for_api(int,text,text)','execute')
    and not has_function_privilege('authenticated','public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
    and has_function_privilege('service_role','public.c24_impact_for_api(int,text,text)','execute')
    and not exists(select from private.c24_fixture) and not exists(select from private.c24_definitions where state='active');`)).toBe("t");

  const [founderAccount, mapperAccount, governorAccount, evidence, other, publisherAccount, challengeAccount, triageAccount, needReviewAccount, needPublishAccount,
    associationAccount, ...owners] = await Promise.all(
    Array.from({ length: 16 }, () => makeMember()));
  for (const person of [founderAccount, mapperAccount, governorAccount, evidence, other, publisherAccount, challengeAccount, triageAccount,
    needReviewAccount, needPublishAccount, associationAccount, ...owners]) finishPersonalOnboarding(person);
  const verification = [founderAccount, mapperAccount, governorAccount, evidence, publisherAccount, challengeAccount, ...owners].map(({ id }) =>
    "('" + id + "','identity','verified','review','" + other.id + "',now())").join(",");
  sql(`insert into private.platform_bootstrap(user_id) values('${founderAccount.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founderAccount.id}','${founderAccount.id}','first_account_bootstrapped','Synthetic C2.4 Founder');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values ${verification};
    insert into public.user_settings(user_id,discoverable) values ${owners.map(({ id }) => "('" + id + "',true)").join(",")}
      on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id in (${owners.map(({ id }) => "'" + id + "'").join(",")});
    insert into private.c21_outcome_fixture values(true); insert into private.c22_fixture values(true);
    insert into private.c23_fixture values(true); insert into private.c24_fixture values(true);`);
  const [founder, mapper, governor, evidenceReviewer, publisher, challenger] = await Promise.all(
    [founderAccount, mapperAccount, governorAccount, evidence, publisherAccount, challengeAccount].map(recent));
  const founderWorkspace = (await request<{ id: string }>("/api/v1/me/private-workflows", 200, founder, undefined, { kind: "admin_workspace" }, "POST")).id;
  const publicationPath = "/api/v1/private/project-outcome-publication";
  const c23Workspace = (await request<{ id: string }>(publicationPath + "/workspace", 200, founder, undefined, { lane: "admin" }, "POST")).id;
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  for (const actor of [mapper, governor]) {
    await request(publicationPath + "/roster", 200, founder, c23Workspace, {
      action: "grant", requestId: randomUUID(), expectedVersion: 0, note, confirmed: true,
      department: "HT-CE", target: actor.id, expiresAt: expiry,
    }, "POST");
  }
  const reviewerWorkspace = async (actor: Member) => (await request<{ id: string }>(publicationPath + "/workspace", 200,
    actor, undefined, { lane: "review" }, "POST")).id;
  const [mapperWorkspace, governorWorkspace] = await Promise.all([mapper, governor].map(reviewerWorkspace));

  try {
    await request(founderPath, [401,403], signedIn, founderWorkspace);
    await request(reviewerPath, 403, governor, mapperWorkspace);
    await request(reviewerPath, 403, governor, governorWorkspace, receipt("approve_definition", 1, { code: "school_desks", methodReviewed: true }));
    await request(founderPath, 200, founder, founderWorkspace, receipt("grant", 0, { target: governor.id, expiresAt: expiry }));
    await request(reviewerPath, 200, governor, governorWorkspace, receipt("approve_definition", 1, { code: "school_desks", methodReviewed: true }));
    const configure = { years: [year], sectors: ["education", "environment"], departments: impactDepartments,
      links: true, measurements: true, needs: true };
    const command = receipt("configure", 0, configure);
    expect(await request(founderPath, 200, founder, founderWorkspace, command)).toEqual({ version: 1 });
    expect(await request(founderPath, 200, founder, founderWorkspace, command)).toEqual({ version: 1 });
    await request(founderPath, 409, founder, founderWorkspace, { ...command, links: false });
    expect((await request<ImpactResponse>(publicPath, 200)).state).toBe("disabled");
    sql("update private.c24_settings set enabled=true;");
    expect(await request(publicPath, 200)).toMatchObject({ state: "unavailable", filters: { departments: expect.arrayContaining([...impactDepartments]) } });
    await request(publicPath + "?sector=education&year=" + year + "&department=HT-unknown", 400);
    await request(publicPath + "?sector=education&year=" + year + "&startsOn=2025-06-01", 400);

    sql(`insert into private.c11_intake_fixture values(true,true); insert into private.c12_fixture values(true);
      insert into private.c13_fixture values(true); insert into private.c14_fixture values(true);
      insert into feed_data.community_memberships(community_id,user_id)
      select c.id,actor from feed_data.communities c cross join unnest(array[${owners.map(({ id }) => "'" + id + "'::uuid").join(",")}]) actor
      where c.department_code='HT-CE' and c.kind='department' on conflict do nothing;`);
    const [linkedOwner, triager, needReviewer, needPublisher, associationReviewer] = await Promise.all(
      [owners[2], triageAccount, needReviewAccount, needPublishAccount, associationAccount].map(recent));
    owners[2] = linkedOwner;
    const linked = await createLinkedImpactProject(linkedOwner, owners[3], founder, triager, needReviewer,
      needPublisher, associationReviewer, founderWorkspace, year);
    const centre = owners.map((owner, index) => index === 2 ? linked.project :
      seedProject(owner, "HT-CE", "education", index === 0 ? "organization" : index === 1 ? "community" : "individual"));
    const needs = centre.map((project, index) => index === 2 ? linked.need :
      seedNeedAssociation(owners[(index + 1) % owners.length], owners[index], evidence,
        project, index === 0 ? "organization" : index === 1 ? "community" : "individual"));
    const needPath = (id: string) => "/api/v1/me/impact/needs/" + id;
    await request(needPath(needs[0].id), 404, other);
    expect(await request(needPath(needs[0].id), 200, needs[0].author)).toEqual({ consented: false, version: 0 });
    for (const need of needs) await request(needPath(need.id), 200, need.author, undefined, receipt("allow_need", 0));
    const mapped: Awaited<ReturnType<typeof publishReviewedObservation>>[] = [];
    for (const [index, project] of centre.entries()) {
      mapped.push(index === 2 ? await publishReviewedObservation(project, linked.source, year, linkedOwner, founder, publisher,
        evidenceReviewer, challenger, c23Workspace) : seedDisclosure(owners[index], evidence, project, "HT-CE",
        index === 0 ? "partially_supported" : "supported", 0, index === 0 ? 6 : 0));
    }
    await page.goto("/projects/" + mapped[2].project);
    await expect(page.getByText("Independently reviewed desk deliveries", { exact: true })).toBeVisible();
    const adverse = ["insufficient_evidence", "not_supported"].map((classification) => {
      const project = seedProject(owners[0], "HT-OU", "education");
      return seedDisclosure(owners[0], evidence, project, "HT-OU", classification, null, 5);
    });
    const invalid = seedDisclosure(owners[0], evidence, seedProject(owners[0], "HT-OU", "education"), "HT-OU", "supported", 6, 6, "chairs");
    const readMapping = (item: typeof mapped[number]) => request<ImpactMapping>(memberPath + item.publication, 200, item.owner);
    expect((await readMapping(invalid)).catalog).toEqual([]);
    for (const item of adverse) expect((await readMapping(item)).catalog).toEqual([]);
    const submit = (item: typeof mapped[number], version: number, deliveryReference: string, status = 200) =>
      request(memberPath + item.publication, status, item.owner, undefined,
        receipt("submit_mapping", version, { code: "school_desks", definitionVersion: 1, deliveryReference }));
    const approve = (item: typeof mapped[number], version: number) =>
      request(reviewerPath + "/mappings/" + item.publication, 200, mapper, mapperWorkspace,
        receipt("approve_mapping", version, { methodReviewed: true }));
    await request(memberPath + mapped[0].publication, 404, other);
    await submit(invalid, 0, "INCOMPATIBLE_EXAMPLE", 409);
    for (const [index, item] of mapped.entries()) await submit(item, 0, "DESK_DELIVERY_" + index);
    await request(reviewerPath + "/mappings?scope=HT-OU", 403, mapper, mapperWorkspace);
    const queue = await request<{ items: unknown[] }>(reviewerPath + "/mappings?scope=HT-CE", 200, mapper, mapperWorkspace);
    expect(queue.items).toHaveLength(5);
    expect(await request(reviewerPath + "/mappings/" + mapped[0].publication, 200, mapper, mapperWorkspace))
      .toMatchObject({ reviewReference: "DESK_DELIVERY_0", method: "SIGNED_DESK_HANDOVER_V1" });
    await request(reviewerPath + "/mappings/" + mapped[0].publication, 403, founder, founderWorkspace,
      receipt("approve_mapping", 1, { methodReviewed: true }));
    for (const item of mapped) await approve(item, 1);

    const snapshot = () => JSON.parse(sql(`select private.c24_snapshot(${year},'education',s)->'cells' from private.c24_settings s;`));
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "available", value: 0 });
    await submit(mapped[1], 2, "DESK_DELIVERY_0");
    await approve(mapped[1], 3);
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "suppressed", value: null });
    await submit(mapped[1], 4, "DESK_DELIVERY_1");
    await approve(mapped[1], 5);
    expect(snapshot()["HT-CE"].measurements[0].result).toEqual({ state: "available", value: 0 });

    const query = (department: string, sector = "education") => publicPath + "?" + new URLSearchParams({
      department, sector, year: String(year),
    });
    expect((await request<ImpactResponse>(query("HT-CE"), 200)).state).toBe("unavailable");
    await request(founderPath, 200, founder, founderWorkspace, receipt("propose_report", 0, { year, scope: "education" }));
    const overview = await request<ImpactOverview>(reviewerPath, 200, governor, governorWorkspace);
    const candidate = overview.releases.find((release) => release.sector === "education")!;
    expect(candidate.preview?.national.completed).toEqual({ state: "suppressed", value: null });
    const approveBody = { year, scope: "education", fingerprint: candidate.fingerprint, methodReviewed: true };
    await request(reviewerPath, 403, mapper, mapperWorkspace, receipt("seal_report", 1, approveBody));
    await request(reviewerPath, 409, governor, governorWorkspace, receipt("seal_report", 1, { ...approveBody, fingerprint: "f".repeat(64) }));
    await request(reviewerPath, 200, governor, governorWorkspace, receipt("seal_report", 1, approveBody));
    const centreReport = await request<ImpactResponse>(query("HT-CE"), 200);
    expect(centreReport).toMatchObject({ state: "available", report: {
      completed: { state: "available", value: 5 }, reviewed: { state: "available", value: 5 },
      supported: { state: "available", value: 5 }, linkedNeeds: { state: "available", value: 5 }, measurements: [{ result: { state: "available", value: 0 } }],
    } });
    expect(await request(query("national"), 200)).toMatchObject({ report: { completed: { state: "suppressed", value: null },
      reviewed: { state: "suppressed", value: null }, participating: { state: "suppressed", value: null },
      linkedNeeds: { state: "suppressed", value: null }, measurements: [{ result: { state: "suppressed", value: null } }] } });
    expect(await request(query("HT-OU"), 200)).toMatchObject({ report: { completed: { state: "suppressed", value: null },
      measurements: [{ result: { state: "suppressed", value: null } }] } });
    for (const department of impactDepartments.filter((item) => !["HT-CE", "HT-OU"].includes(item))) {
      expect(snapshot()[department].completed).toEqual({ state: "unavailable", value: null });
    }
    expect((await request<ImpactResponse>(query("HT-CE", "environment"), 200)).state).toBe("unavailable");
    expect(JSON.stringify(centreReport)).not.toMatch(/Private review|Private association marker|synthetic-source|delivery_hash|requester_id|fingerprint|findingId/);

    await page.goto("/impact?year=" + year + "&sector=education&department=HT-CE");
    await expect(page.getByRole("heading", { name: impactCopy("en")("measurements"), exact: true })).toBeVisible();
    await expect(page.getByText("0 desks", { exact: true })).toBeVisible();
    const departmentFilter = page.getByRole("combobox", { name: "Department", exact: true });
    expect(await departmentFilter.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).sort())).toEqual([...impactDepartments, "national"].sort());
    await departmentFilter.selectOption("national");
    await page.getByRole("button", { name: "View report" }).click();
    await expect(page.getByText("Withheld", { exact: true }).first()).toBeVisible();

    const author = linked.need.author.id;
    const organizer = linkedOwner.id;
    // Isolate the normal relationship lifecycle from the evidence revocation below.
    const associationReceipt = sql(`begin;
      insert into feed_data.member_blocks(actor_id,target_id) values('${author}','${organizer}');
      delete from feed_data.member_blocks where actor_id='${author}' and target_id='${organizer}';
      select r.state||':'||count(e.id) from private.c24_releases r
        left join private.c24_events e on e.resource=r.report_year||'/'||r.sector
          and e.action='suppress' and e.version=r.version
        where r.report_year=${year} and r.sector='education'
        group by r.state;
      rollback;`);
    expect(associationReceipt.split(/\r?\n/)).toContain("suppressed:1");
    expect((await request<ImpactResponse>(query("HT-CE"), 200)).state).toBe("available");

    sql(`update private.c22_releases set revoked_at=now() where case_id='${mapped[2].caseId}';`);
    expect((await request<ImpactResponse>(query("HT-CE"), 200)).state).toBe("suppressed");
    sql(`update private.c22_releases set revoked_at=null where case_id='${mapped[2].caseId}';`);
    expect((await request<ImpactResponse>(query("national"), 200)).state).toBe("suppressed");
    await request(founderPath, 409, founder, founderWorkspace, receipt("propose_report", 3, { year, scope: "education" }));
    await page.reload();
    await expect(page.getByText(impactCopy("en")("withheld"), { exact: true })).toBeVisible();

    sql(`with seeds as (
      select gen_random_uuid() id, unnest(array[${owners.map(({ id }) => "'" + id + "'::uuid").join(",")}]) owner
      from generate_series(1,32)
    ), projects as (
      insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      select id,owner,owner,gen_random_uuid(),'x','approved',owner,now(),now(),now() from seeds returning id,owner_user_id
    ), revisions as (
      insert into private.project_revisions(project_id,revision,author_id,proposal)
      select id,1,owner_user_id,'{"title":"Synthetic planting project","country":"HT","department":"HT-CE","category":"environment","references":[]}'
      from projects returning project_id
    ), executions as (
      insert into private.project_execution(project_id,approved_revision,status) select project_id,1,'completed' from revisions
      returning project_id
    )
    insert into private.project_operations_events(project_id,action,detail,created_at)
    select project_id,'execution_status','completed','${year}-04-20T12:00:00Z' from executions;`);
    expect(sql(`select count(*) from private.c24_projects(${year},'environment',array['HT-CE']);`)).toBe("160");
    const benchmark = JSON.parse(sql(`explain (analyze,format json) select private.c24_snapshot(${year},'environment',s) from private.c24_settings s;`));
    expect(benchmark[0]["Execution Time"]).toBeLessThan(2500);
    console.log("C2.4 benchmark (160 eligible projects):", benchmark[0]["Execution Time"], "ms");
    const performance = JSON.parse(sql(`explain (analyze,format json) select private.c24_snapshot(${year},'education',s) from private.c24_settings s;`));
    expect(performance[0]["Execution Time"]).toBeLessThan(2500);
    console.log("C2.4 snapshot execution time for the mixed synthetic cohort:", performance[0]["Execution Time"], "ms");
    const ownerRows = owners.map(({ id }) => "'" + id + "'::uuid").join(",");
    let previous = 160;
    for (const population of [1000, 10_000, 50_000]) {
      rehearsalSql(`with seeds as (
        select i,gen_random_uuid() id,(array[${ownerRows}])[1+mod(i,5)] owner
        from generate_series(${previous + 1},${population}) i
      ), projects as (
        insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
        select id,owner,owner,gen_random_uuid(),'x','approved',owner,now(),now(),case when i%11<>0 then now() end
        from seeds returning id
      ), revisions as (
        insert into private.project_revisions(project_id,revision,author_id,proposal)
        select p.id,1,owner,jsonb_build_object('title','Synthetic load project','country',case when i%17=0 then 'US' else 'HT' end,
          'department',case when i%2=0 then 'HT-CE' else 'HT-OU' end,
          'category',case when i%7=0 then 'environment' else 'technology' end,'references','[]'::jsonb)
        from projects p join seeds using(id) returning project_id
      ), execution as (
        insert into private.project_execution(project_id,approved_revision,status)
        select project_id,1,case when i%13=0 then 'active' else 'completed' end
        from revisions join seeds on seeds.id=project_id returning project_id
      )
      insert into private.project_operations_events(project_id,action,detail,created_at)
      select project_id,'execution_status','completed',
        case when i<=2400 and i%3<>0 then '${year}-04-20T12:00:00Z'::timestamptz
          else '${year - 1}-04-20T12:00:00Z'::timestamptz end
      from execution join seeds on seeds.id=project_id;
      analyze private.project_execution;
      analyze private.project_operations_events;
      analyze private.community_projects;
      analyze private.project_revisions;`);
      previous = population;
      const samples = Array.from({ length: 5 }, () => JSON.parse(rehearsalSql(`explain (analyze,buffers,format json)
        select private.c24_snapshot(${year},'environment',s) from private.c24_settings s;`))[0]["Execution Time"] as number)
        .sort((a, b) => a - b);
      const payload = Number(rehearsalSql(`select octet_length(private.c24_snapshot(${year},'environment',s)::text)
        from private.c24_settings s;`));
      expect(payload).toBeGreaterThan(0);
      console.log("C2 population benchmark", JSON.stringify({ population, samples, medianMs: samples[2],
        maxMs: samples.at(-1), privateSnapshotBytes: payload }));
    }
    await request(founderPath, 200, founder, founderWorkspace, receipt("propose_report", 0, { year, scope: "environment" }));
    const environment = (await request<ImpactOverview>(reviewerPath, 200, governor, governorWorkspace)).releases
      .find((release) => release.sector === "environment")!;
    await request(reviewerPath, 200, governor, governorWorkspace, receipt("seal_report", environment.version,
      { year, scope: "environment", fingerprint: environment.fingerprint, methodReviewed: true }));
    const samples: { ms: number; status: number; bytes: number }[] = [];
    for (let batch = 0; batch < 3; batch++) {
      samples.push(...await Promise.all(Array.from({ length: 3 }, async () => {
        const start = clock.now();
        const response = await fetch(api + query("national", "environment"), { signal: AbortSignal.timeout(10_000) });
        const text = await response.text();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        if (response.ok) expect(JSON.parse(text)).toMatchObject({ state: "available" });
        return { ms: Math.round(clock.now() - start), status: response.status, bytes: Buffer.byteLength(text) };
      })));
    }
    const successes = samples.filter(({ status }) => status === 200).map(({ ms }) => ms).sort((a, b) => a - b);
    expect(successes.length).toBeGreaterThan(0);
    const quantile = (q: number) => successes[Math.ceil(q * successes.length) - 1];
    console.log("C2 local API read bursts", JSON.stringify({ samples, medianMs: quantile(0.5), p95Ms: quantile(0.95),
      p99Ms: quantile(0.99) }));
    sql(`delete from private.c24_fixture; delete from private.c23_fixture; delete from private.c22_fixture;
      delete from private.c21_outcome_fixture; delete from private.c14_fixture; delete from private.c13_fixture;
      delete from private.c12_fixture; delete from private.c11_intake_fixture;`);
    verifyImpactRecovery();
  } finally {
    sql(`delete from private.c24_fixture; delete from private.c23_fixture; delete from private.c22_fixture;
      delete from private.c21_outcome_fixture; delete from private.c14_fixture; delete from private.c13_fixture;
      delete from private.c12_fixture; delete from private.c11_intake_fixture; delete from private.platform_bootstrap where user_id='${founderAccount.id}';`);
  }
});
