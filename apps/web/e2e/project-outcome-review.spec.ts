import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { MemberOutcomeReview, OutcomePage, OutcomeRequest, OutcomeReviewCase, OutcomeSource } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, inEnglish, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";
import { outcomeReviewMessages } from "../src/lib/project-outcome-review-i18n";

const root = "/api/v1/private/project-outcome-review";
const department = "HT-CE";
const note = "The reviewed project record contains the documented result.";
const reason = { note, confirmed: true };

async function elevated(person: Member): Promise<Member & { secret: string }> {
  const secret = await enroll(person);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: person.email, password: person.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing disposable authenticator");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...person, token: result.data.access_token, secret };
}

async function call<T>(who: Member | null, url: string, expected: number | number[],
  { method = "GET", body, workspace }: { method?: string; body?: object; workspace?: string } = {}): Promise<T> {
  const response = await fetch(api + url, { method, signal: AbortSignal.timeout(10_000), body: body && JSON.stringify(body),
    headers: { ...(who && { Authorization: "Bearer " + who.token }), ...(workspace && { "X-Ayinou-Workspace": workspace }),
      ...(body && { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }) } });
  const payload = response.headers.get("content-type")?.includes("image/webp") ? await response.arrayBuffer() : await response.json();
  expect([expected].flat(), method + " " + url + (response.ok ? "" : " " + JSON.stringify(payload))).toContain(response.status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return payload as T;
}

test("C2.2 isolates authority, released evidence and versioned independent findings", async ({ page, context, browser, signedIn, makeMember }) => {
  test.setTimeout(150_000);
  const [ownerAccount, firstAccount, secondAccount, thirdAccount, deputyAccount, outsider] = await Promise.all(
    Array.from({ length: 6 }, () => makeMember()));
  for (const user of [ownerAccount, firstAccount, secondAccount, thirdAccount, deputyAccount, outsider]) finishPersonalOnboarding(user);
  sql("insert into private.platform_bootstrap(user_id) values('" + ownerAccount.id + "');" +
    "insert into private.platform_admin_audit(actor_id,subject_id,event,reason) values('" + ownerAccount.id + "','" + ownerAccount.id +
    "','first_account_bootstrapped','Synthetic Founder appointment');" +
    "insert into public.role_assignments(user_id,role) values('" + deputyAccount.id + "','administrator');");
  const [founder, first, second, third, deputy] = await Promise.all(
    [ownerAccount, firstAccount, secondAccount, thirdAccount, deputyAccount].map(elevated));
  const owner = founder;

  const sig = "public.c22_reviews_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)";
  expect(sql("select has_function_privilege('service_role','" + sig +
    "','execute') and not has_function_privilege('anon','" + sig + "','execute') and not has_function_privilege('authenticated','" + sig +
    "','execute') and not exists(select from private.c22_fixture) and (select count(*)=11 and bool_and(c.relrowsecurity) from pg_class c " +
    "where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname like 'c22_%') and not exists(select " +
    "from pg_class c cross join unnest(array['anon','authenticated','service_role','authenticator']) roles(role) " +
    "where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname like 'c22_%' " +
    "and has_table_privilege(roles.role,c.oid,'select,insert,update,delete'));")).toBe("t");

  const project = randomUUID(), metric = randomUUID(), observation = randomUUID(), noMeasure = randomUUID(), finalReport = randomUUID();
  const qualitative = randomUUID(), absent = randomUUID();
  const path = "/api/v1/projects/" + project + "/outcome-validation";
  const work = "/projects/" + project + "/work?section=outcomes";
  const image = (await sharp({ create: { width: 8, height: 8, channels: 3, background: "#224488" } }).webp().toBuffer());
  const digest = "8".repeat(64);
  const foreignEntry = randomUUID();
  const p = { title: "Recorded classroom work", category: "education", country: "HT", department, description: "Independent review exercise." };
  const memberIds = [owner, first, second, third, deputy, outsider].map(({ id }) => "('" + id + "','identity','verified','review','" +
    (id === outsider.id ? first.id : outsider.id) + "',now())").join(",");
  sql("insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values " + memberIds + ";" +
    "insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at)" +
    " values('" + project + "','" + founder.id + "','" + founder.id + "',gen_random_uuid(),'x','approved','" + founder.id + "',now(),now());" +
    "insert into private.project_revisions(project_id,revision,author_id,proposal) values('" + project + "',1,'" + founder.id + "','" + JSON.stringify(p) + "');" +
    "insert into private.project_execution(project_id,approved_revision,status) values('" + project + "',1,'completed');" +
    "insert into private.project_metrics(id,project_id,creator_id,name,unit,target) values('" + metric + "','" + project + "','" + founder.id +
    "','Lessons logged','lessons',8);" +
    "insert into private.project_metric_observations(id,project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference) values('" +
    observation + "','" + project + "','" + metric + "','" + founder.id +
    "','2026-01-01','2026-01-31',6,'Six lessons were reported.','https://example.org/record');" +
    "insert into private.project_images(project_id,digest,image) values('" + project + "','" + digest + "',decode('" + image.toString("hex") + "','hex'));" +
    "insert into private.project_progress_entries(id,project_id,author_id,reviewer_id,kind,visibility,state,request_key,request_digest,content,image_digest,version)" +
    " values('" + finalReport + "','" + project + "','" + founder.id + "','" + outsider.id + "','report','team','approved',gen_random_uuid(),'x'," +
    "'{\"title\":\"Native final report\",\"summary\":\"The library sessions took place.\",\"references\":[]}', '" + digest + "',3)," +
    [noMeasure, qualitative, absent, foreignEntry].map((id, index) => "('" + id + "','" + project + "','" + founder.id +
      "',null,'update','team','approved',gen_random_uuid(),'x','{\"title\":\"Reported progress " + index +
      "\",\"summary\":\"Qualitative record for independent review.\",\"references\":[\"https://example.org/notes\"]}',null,2)").join(",") + ";");

  await call(signedIn, root + "/notices", 404);
  await page.goto("/projects/review/outcomes");
  await expect(page.getByText(outcomeReviewMessages.en.closed, { exact: true })).toBeVisible();
  for (const locale of ["ht","fr","es"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByText(outcomeReviewMessages[locale].closed, { exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
  sql("insert into private.c21_outcome_fixture values(true); insert into private.c22_fixture values(true);");
  try {
    const initialRevision = () => sql("select md5(string_agg(to_jsonb(x)::text,'' order by x.id)) from private.project_progress_entries x where project_id='" + project + "';");
    const preserved = initialRevision();
    const open = async (person: Member, lane: string, status: number | number[] = 200) => (await call<{ id: string }>(person, root + "/workspace", status,
      { method: "POST", body: { lane } })).id;
    const admin = await open(founder, "admin");
    await open(first, "review", 403);
    await open(deputy, "admin", 403);
    await open(firstAccount, "review", [401,403]);
    await call(null, root + "/notices", 401);
    const expiry = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const grant = (target: Member, purpose: string, expectedVersion = 0, action = "grant", scope = department, status = 200, acting = founder, ws = admin) =>
      call(acting, root + "/roster", status, { method: "POST", workspace: ws, body: { ...reason, requestId: randomUUID(), action, purpose,
        target: target.id, department: scope, expectedVersion, ...(action === "grant" && { expiresAt: expiry(7) }) } });
    await grant(first, "initial");
    await grant(second, "challenge");
    await grant(third, "initial");
    await grant(deputy, "assign");
    await grant(outsider, "initial", 0, "grant", department, 403);
    const ws1 = await open(first, "review"), ws2 = await open(second, "review"), ws3 = await open(third, "review");
    const deputyWorkspace = await open(deputy, "admin");
    await grant(deputy, "initial", 0, "grant", department, 403, deputy, deputyWorkspace);

    const create = async (kind: string, sourceId: string) => {
      const sources = await call<OutcomePage<OutcomeSource>>(owner, path + "/sources?sourceKind=" + kind, 200);
      const source = sources.items.find(({ id }) => id === sourceId)!;
      const draft = await call<OutcomeRequest>(owner, path, 201, { method: "POST",
        body: { sourceKind: kind, sourceId, sourceRevision: source.revision, sourceFingerprint: source.fingerprint,
          classification: "outcome", explanation: "Please review the recorded source and evidence." } });
      await call(owner, path + "/" + draft.id, 200, { method: "PATCH",
        body: { action: "submit", expectedRevision: 1, confirmed: true } });
      return draft.id;
    };
    const member = (id: string) => path + "/" + id + "/review";
    const read = (id: string) => call<MemberOutcomeReview>(owner, member(id), 200);
    const step = (id: string, who: Member, ws: string, lane: "admin" | "review", action: string,
      expectedVersion: number, extra = {}, status: number | number[] = 200, requestId: string = randomUUID()) =>
      call<{ version: number }>(who, root + "/" + id + "?lane=" + lane, status,
        { method: "PATCH", workspace: ws, body: { ...reason, requestId, expectedVersion, action, ...extra } });
    const memberStep = (id: string, action: string, expectedVersion: number, extra = {}, status = 200) =>
      call<{ version: number }>(owner, member(id), status, { method: "PATCH",
        body: { ...reason, requestId: randomUUID(), expectedVersion, action, ...extra } });
    const assign = (id: string, candidate: Member, version: number, status: number | number[] = 200) =>
      step(id, deputy, deputyWorkspace, "admin", "assign", version, { target: candidate.id, expiresAt: expiry(3) }, status);
    const evidence = (id: string, reviewer: Member, workspace: string, version: number, status: number | number[] = 200) =>
      call(reviewer, root + "/" + id + "/evidence?expectedVersion=" + version, status, { workspace });
    const decide = (id: string, reviewer: Member, workspace: string, version: number, classification: string,
      measurement?: object, status: number | number[] = 200, requestId?: string) =>
      step(id, reviewer, workspace, "review", "finding", version, { classification,
        limitations: "The recorded pointer limits the conclusion to this reporting period.", measurement: measurement ?? null }, status, requestId);

    const id = await create("observation", observation);
    await call(outsider, member(id), 404);
    await call(first, root + "?lane=review&department=HT-OU", 403, { workspace: ws1 });
    await call(first, root + "?lane=review&department=" + department, 403, { workspace: ws2 });
    await call(firstAccount, root + "?lane=review&department=" + department, [401,403], { workspace: ws1 });
    await step(id, founder, admin, "admin", "finding", 1, { classification: "supported", limitations: "Restrictions apply.", measurement: null }, 403);
    await assign(id, founder, 1, 403);
    await assign(id, second, 1, 403);
    const attempts = await Promise.all([assign(id, first, 1, [200,409]), assign(id, third, 1, [200,409])]);
    expect(attempts.filter((result) => result.version === 2)).toHaveLength(1);
    const assignment = await call<OutcomeReviewCase>(deputy, root + "/" + id + "?lane=admin", 200, { workspace: deputyWorkspace });
    const active = assignment.assignment?.reviewer === first.id ? first : third;
    const activeWs = active.id === first.id ? ws1 : ws3;
    const spare = active.id === first.id ? third : first;
    const spareWs = spare.id === first.id ? ws1 : ws3;
    expect(assignment).not.toHaveProperty("manifest");
    await evidence(id, deputy, deputyWorkspace, 2, 403);
    await evidence(id, active, activeWs, 2, 403);
    await step(id, active, activeWs, "review", "accept", 2, { conflictFree: true });
    await memberStep(id, "release_evidence", 3);
    await evidence(id, active, activeWs, 4);
    await memberStep(id, "revoke_evidence", 4);
    await evidence(id, active, activeWs, 5, 403);
    await memberStep(id, "release_evidence", 5);
    await decide(id, active, activeWs, 6, "partially_supported", undefined, 403);
    await evidence(id, active, activeWs, 6);
    const measurement = { quantity: 0, unit: "lessons", startsOn: "2026-01-01", endsOn: "2026-01-31",
      methodology: "Counted the eligible lesson records from the released evidence." };
    await decide(id, active, activeWs, 6, "partially_supported", { ...measurement, unit: "people" }, 400);
    const receipt = randomUUID();
    const decisions = await Promise.all([
      decide(id, active, activeWs, 6, "partially_supported", measurement, [200,404], receipt),
      decide(id, active, activeWs, 6, "partially_supported", measurement, [200,404]),
    ]);
    expect(decisions.filter((item) => item.version === 7)).toHaveLength(1);
    const winning = sql("select request_id from private.c22_events where case_id='" + id + "' and action='finding';");
    await decide(id, active, activeWs, 6, "partially_supported", measurement, 200, winning);
    const result = await read(id);
    const original = result.findings[0];
    expect(original).toMatchObject({ classification: "partially_supported", current: true, measurement: { quantity: 0 } });
    expect(Object.keys(original)).not.toContain("reviewer");
    expect(new Date(original.challengeUntil!).getTime() - new Date(original.availableAt).getTime()).toBe(14 * 86_400_000);
    expect((await call<{ action: string }[]>(owner, root + "/notices", 200)).some((notice) => notice.action === "finding")).toBeTruthy();

    await memberStep(id, "challenge", 7, { findingId: original.id });
    await grant(active, "challenge");
    await assign(id, active, 8, 403);
    await assign(id, second, 8);
    await step(id, second, ws2, "review", "accept", 9, { conflictFree: true });
    await evidence(id, second, ws2, 10);
    await step(id, second, ws2, "review", "return", 10);
    await assign(id, active, 11, 403);
    await assign(id, spare, 11);
    await step(id, spare, spareWs, "review", "accept", 12, { conflictFree: true });
    await evidence(id, spare, spareWs, 13);
    await decide(id, spare, spareWs, 13, "not_supported");
    const resolved = await read(id);
    expect(resolved.findings.map(({ lane }) => lane)).toEqual(["reassessment","initial"]);
    expect(resolved.findings[1].challenge?.resolution).toBe("reassessed");
    await memberStep(id, "challenge", 14, { findingId: resolved.findings[0].id }, 409);

    const report = await create("final_report", finalReport);
    await assign(report, first, 1);
    await step(report, first, ws1, "review", "recuse", 2);
    await assign(report, first, 3, 403);
    await assign(report, third, 3);
    await step(report, third, ws3, "review", "accept", 4, { conflictFree: true });
    await memberStep(report, "release_evidence", 5);
    await evidence(report, third, ws3, 6);
    const getImage = (entry: string, status: number) => call<ArrayBuffer>(third,
      root + "/" + report + "/evidence/" + entry + "/image?sourceRevision=3&expectedVersion=6", status, { workspace: ws3 });
    expect((await getImage(finalReport, 200)).byteLength).toBe(image.length);
    await getImage(foreignEntry, 404);
    await step(report, third, ws3, "review", "clarify", 6);
    const question = await read(report);
    expect(question.clarification).toBe(note);
    await memberStep(report, "correct", 7, { manifest: question.manifest });
    const revised = await read(report);
    expect(revised.revision).toBe(2);
    expect(revised.released).toBe(false);
    expect(revised.history).toHaveLength(2);
    await assign(report, third, 8);
    await step(report, third, ws3, "review", "accept", 9, { conflictFree: true });
    await memberStep(report, "release_evidence", 10);
    await evidence(report, third, ws3, 11);
    await decide(report, third, ws3, 11, "supported");
    expect((await read(report)).findings[0]).toMatchObject({ classification: "supported", measurement: null });

    const expiring = await create("progress_report", noMeasure);
    await assign(expiring, first, 1);
    await step(expiring, first, ws1, "review", "accept", 2, { conflictFree: true });
    await memberStep(expiring, "release_evidence", 3);
    sql("update private.c22_authority set expires_at=now()-interval '1 second' where actor='" + first.id + "' and lane='initial';");
    await evidence(expiring, first, ws1, 4, [403,404]);
    await grant(first, "initial", 1, "suspend");
    await evidence(expiring, first, ws1, 4, [403,404]);
    await grant(first, "initial", 2);
    await evidence(expiring, first, ws1, 4, 404);
    await assign(expiring, first, 4);
    await step(expiring, first, ws1, "review", "accept", 5, { conflictFree: true });
    await evidence(expiring, first, ws1, 6);
    await decide(expiring, first, ws1, 6, "insufficient_evidence");
    const late = (await read(expiring)).findings[0];
    sql("update private.c22_findings set available_at=now()-interval '15 days' where id='" + late.id + "';");
    expect((await read(expiring)).findings[0].challengeUntil).toBeNull();
    await memberStep(expiring, "challenge", 7, { findingId: late.id }, 409);
    await grant(first, "initial", 3, "revoke");

    const stale = await create("progress_report", qualitative);
    sql("update private.project_progress_entries set version=3 where id='" + qualitative + "';");
    await assign(stale, third, 1, 409);
    expect((await read(stale)).activeSource).toBe(false);
    sql("update private.project_progress_entries set version=2 where id='" + qualitative + "';");
    const final = await create("progress_report", absent);
    await call(owner, path + "/" + final, 200, { method: "PATCH", body: { action: "withdraw", expectedRevision: 2, confirmed: true } });
    expect((await read(final)).status).toBe("withdrawn");
    expect(initialRevision()).toBe(preserved);

    const ownerContext = await browser.newContext();
    try {
      await inEnglish(ownerContext);
      const ownerPage = await ownerContext.newPage();
      await login(ownerPage, owner);
      await solveMfa(ownerPage, owner.secret);
      await ownerPage.goto(work);
      await expect(ownerPage.getByRole("heading", { name: "Independent outcome validation" })).toBeVisible();
      await ownerPage.getByRole("button", { name: /Lessons logged/ }).click();
      await expect(ownerPage.getByRole("heading", { name: "Not supported" })).toBeVisible();
      await expect(ownerPage.getByText("0 lessons", { exact: true })).toBeVisible();
    } finally {
      await ownerContext.close();
    }
  } finally {
    sql("delete from private.c22_fixture; delete from private.c21_outcome_fixture;");
  }
});

test("C2.2 resolves the native ten department scopes without guessing ambiguous or international scope", async ({ signedIn, makeMember }) => {
  const owner = signedIn;
  const verifier = await makeMember();
  finishPersonalOnboarding(owner);
  const id = randomUUID(), mixed = randomUUID(), international = randomUUID(), org = randomUUID(), orgProject = randomUUID();
  const scope = (project: string) => sql("select coalesce(private.c22_department(p),'closed') from private.community_projects p where p.id='" + project + "';");
  sql(
    "insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)" +
    " values('" + owner.id + "','identity','verified','review','" + verifier.id + "',now());" +
    "insert into feed_data.community_memberships(community_id,user_id)" +
    " select id,'" + owner.id + "' from feed_data.communities where kind='department';" +
    "insert into feed_data.community_staff(community_id,user_id,role)" +
    " select id,'" + owner.id + "','administrator' from feed_data.communities where kind='department';" +
    "insert into private.organizations(id,handle,name,kind,country_code,verification_status,created_by)" +
    " values('" + org + "','c22-disposable-organization','Outcome fixture','ngo','HT','verified','" + owner.id + "');" +
    "insert into private.organization_memberships(organization_id,user_id,role) values('" + org + "','" + owner.id + "','owner');" +
    "insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)" +
    " values('" + owner.id + "','" + org + "','organization','approved',now());" +
    "insert into private.community_projects(id,creator_id,community_id,owner_user_id,organization_id,association_id," +
    " submission_key,request_digest,status,submitted_by,submitted_at,approved_at) " +
    "select gen_random_uuid(),'" + owner.id + "'::uuid,c.id,null::uuid,null::uuid,null::uuid,gen_random_uuid(),'x'::bytea,'approved','" + owner.id + "'::uuid,now(),now()" +
    " from feed_data.communities c where c.kind='department'" +
    " union all select '" + id + "','" + owner.id + "',null,'" + owner.id + "',null,null,gen_random_uuid(),'x','approved','" + owner.id + "',now(),now()" +
    " union all select '" + mixed + "','" + owner.id + "',null,'" + owner.id + "',null,c.id,gen_random_uuid(),'x','approved','" + owner.id +
    "',now(),now() from feed_data.communities c where c.slug='ouest'" +
    " union all select '" + international + "','" + owner.id + "',null,'" + owner.id + "',null,null,gen_random_uuid(),'x','approved','" + owner.id + "',now(),now()" +
    " union all select '" + orgProject + "','" + owner.id + "',null,null,'" + org + "',null,gen_random_uuid(),'x','approved','" + owner.id + "',now(),now();" +
    "insert into private.project_revisions(project_id,revision,author_id,proposal)" +
    " select p.id,1,'" + owner.id + "',jsonb_build_object('category','education','country'," +
    "case when p.id='" + international + "' then 'US' else 'HT' end,'department'," +
    "case when p.community_id is not null or p.id='" + international + "' then null else 'HT-CE' end)" +
    " from private.community_projects p where p.creator_id='" + owner.id + "';" +
    "insert into private.project_execution(project_id,approved_revision,status,operator_id)" +
    " select id,1,'active','" + owner.id + "' from private.community_projects where creator_id='" + owner.id + "';");
  expect(sql("select count(*) from private.community_projects p join feed_data.communities c on c.id=p.community_id" +
    " where p.creator_id='" + owner.id + "' and private.c22_department(p)=c.department_code" +
    " and private.project_execution_role(p,'" + owner.id + "')='owner';")).toBe("10");
  expect(scope(id)).toBe(department);
  expect(scope(orgProject)).toBe(department);
  expect(scope(mixed)).toBe("closed");
  expect(scope(international)).toBe("closed");
});
