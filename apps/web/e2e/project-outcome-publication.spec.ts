import { randomUUID } from "node:crypto";
import type { OutcomePage, OutcomePublication, OutcomePublicationReceipt, OutcomePublicationSummary, PublicOutcomeResult } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp, web, type Member } from "./fixtures";
import { outcomePublicationMessages } from "../src/lib/project-outcome-publication-i18n";

const root = "/api/v1/private/project-outcome-publication";
const department = "HT-CE";
const reason = { note: "The reviewed material is limited to the reporting period.", confirmed: true };
const expiry = () => new Date(Date.now() + 86_400_000).toISOString();

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

test("C2.3 publishes only consented current findings after independent disclosure review", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(150_000);
  const [founderAccount, owner, evidenceAccount, firstAccount, secondAccount, outsider] = await Promise.all(
    Array.from({ length: 6 }, () => makeMember()));
  for (const user of [founderAccount, owner, evidenceAccount, firstAccount, secondAccount, outsider]) finishPersonalOnboarding(user);
  sql(`insert into private.platform_bootstrap(user_id) values('${founderAccount.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founderAccount.id}','${founderAccount.id}','first_account_bootstrapped','Synthetic Founder appointment');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at) values
      ${[founderAccount, owner, evidenceAccount, firstAccount, secondAccount].map((member) =>
        "('" + member.id + "','identity','verified','review','" + outsider.id + "',now())").join(",")};
    insert into public.user_settings(user_id,discoverable) values('${owner.id}',true)
      on conflict(user_id) do update set discoverable=true;
    update public.profiles set is_visible=true where user_id='${owner.id}';`);
  const [founder, evidence, first, second] = await Promise.all([founderAccount, evidenceAccount, firstAccount, secondAccount].map(elevated));
  const project = randomUUID();
  const publicUrl = "/api/v1/projects/" + project + "/validated-results";
  const results = () => call<PublicOutcomeResult[]>(null, publicUrl, 200);
  const memberUrl = (id: string) => "/api/v1/projects/" + project + "/outcome-validation/" + id + "/publication";
  const read = (id: string) => call<OutcomePublication>(owner, memberUrl(id), 200);
  const patch = (actor: Member, path: string, action: string, expectedVersion: number, input = {},
    status: number | number[] = 200, workspace?: string, requestId: string = randomUUID()) =>
    call<OutcomePublicationReceipt>(actor, path, status, { method: "PATCH", workspace,
      body: { ...reason, requestId, action, expectedVersion, ...input } });

  expect(sql(`select (select count(*)=7 and bool_and(relrowsecurity) from pg_class
    where relnamespace='private'::regnamespace and relkind='r' and relname like 'c23_%')
    and not exists(select from pg_class c cross join unnest(array['anon','authenticated','service_role','authenticator']) roles(role)
      where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname like 'c23_%'
        and has_table_privilege(roles.role,c.oid,'select,insert,update,delete'))
    and has_function_privilege('service_role','public.c23_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
    and not has_function_privilege('anon','public.c23_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
    and not has_function_privilege('authenticated','public.c23_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
    and not exists(select from private.c23_fixture);`)).toBe("t");

  await call(signedIn, root + "/availability", 404);
  expect(await results()).toEqual([]);
  for (const locale of ["en", "ht", "fr", "es"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.setViewportSize({ width: locale === "en" ? 1440 : 390, height: 900 });
    await page.goto("/projects/review/outcomes/publication");
    await expect(page.getByText(outcomePublicationMessages[locale].closed, { exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(locale === "en" ? 1440 : 390);
  }
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);

  sql(`insert into private.c21_outcome_fixture values(true); insert into private.c22_fixture values(true);
    insert into private.c23_fixture values(true);
    insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,submitted_by,submitted_at,approved_at,directory_published_at)
      values('${project}','${owner.id}','${owner.id}',gen_random_uuid(),'x','approved','${owner.id}',now(),now(),now());
    insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${owner.id}','{"title":"Recorded classroom work","country":"HT","department":"HT-CE","category":"education","publishRequested":true,"references":[],"description":"A synthetic project for classroom learning."}');
    insert into private.project_execution(project_id,approved_revision,status) values('${project}',1,'completed');`);
  const seed = (classification: string, days: number, quantity: number | null) => {
    const source = randomUUID(), id = randomUUID(), finding = randomUUID(), metric = randomUUID();
    sql(`insert into private.project_metrics(id,project_id,creator_id,name,unit,target)
      values('${metric}','${project}','${owner.id}','Classroom sessions ${classification}','sessions',8);
      insert into private.project_metric_observations(id,project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference)
      values('${source}','${project}','${metric}','${owner.id}','2026-01-01','2026-01-31',6,'Six sessions were reported.','https://example.org/private-source');
      insert into private.c21_outcome_requests(id,project_id,requester_id,source_kind,source_id,source_revision,source_fingerprint,
        result,classification,explanation,status,revision,created_at,submitted_at)
      select '${id}',p.id,'${owner.id}','observation',s.id,s.revision,repeat('0',64),s.result,'outcome',
        'Review the documented classroom sessions','submitted',2,now(),now()
      from private.community_projects p cross join lateral private.c21_sources(p,'${owner.id}','owner','observation','${source}',null,1) s
      where p.id='${project}';
      insert into private.c22_cases(id,department,state) values('${id}','${department}','decided');
      insert into private.c22_revisions(case_id,revision,submitted_revision,result,manifest,explanation)
        select id,1,revision,result-'evidence',result->'evidence','Synthetic evidence review'
        from private.c21_outcome_requests where id='${id}';
      insert into private.c22_releases(case_id,revision,generation) values('${id}',1,1);
      insert into private.c22_findings(id,case_id,revision,release_generation,reviewer,lane,classification,explanation,limitations,measurement,available_at)
        values('${finding}','${id}',1,1,'${evidence.id}','initial','${classification}','Private explanation',
          'Private limits for this period',
          ${quantity === null ? "null" : "'{\"quantity\":" + quantity +
            ",\"unit\":\"sessions\",\"startsOn\":\"2026-01-01\",\"endsOn\":\"2026-01-31\",\"methodology\":\"Manual records\"}'"},
          now()-make_interval(days=>${days}));`);
    return { id, finding };
  };
  const supported = seed("supported", 1, 6), partial = seed("partially_supported", 15, 0);
  const early = seed("insufficient_evidence", 1, null), negative = seed("not_supported", 15, null);
  try {
    await call(null, root + "/availability", 401);
    await call(owner, root + "/availability", 200);
    expect((await read(early.id)).options).toEqual([]);
    expect((await read(negative.id)).options?.[0].classification).toBe("not_supported");
    await call(outsider, memberUrl(supported.id), 404);
    const open = async (actor: Member, lane: "admin" | "review", status: number | number[] = 200) =>
      (await call<{ id: string }>(actor, root + "/workspace", status, { method: "POST", body: { lane } })).id;
    const admin = await open(founder, "admin");
    await open(founder, "review", 403);
    await open(firstAccount, "review", [401,403]);
    for (const reviewer of [evidence, first, second]) {
      await call(founder, root + "/roster", 200, { method: "POST", workspace: admin, body: {
        ...reason, requestId: randomUUID(), action: "grant", target: reviewer.id, department, expiresAt: expiry(), expectedVersion: 0,
      } });
    }
    const firstSpace = await open(first, "review"), secondSpace = await open(second, "review");
    await call(first, root + "?lane=review&department=HT-OU", 403, { workspace: firstSpace });
    await call(second, root + "?lane=review&department=" + department, 403, { workspace: firstSpace });
    const draft = (record: { id: string; finding: string }, version: number, title: string) =>
      patch(owner, memberUrl(record.id), "draft", version, { findingId: record.finding, content: {
        title, summary: "The record covers sessions delivered within the listed period.",
        limitations: "The evidence covers a single classroom during the listed period.", includeReported: false,
      } });
    const staff = (id: string, actor: Member, workspace: string, lane: "review" | "admin", action: string,
      version: number, input = {}, status: number | number[] = 200, requestId?: string) =>
      patch(actor, root + "/" + id + "?lane=" + lane, action, version, input, status, workspace, requestId);
    const submit = async (record: { id: string }, expectedVersion: number) => {
      const publication = await read(record.id);
      expect(publication.version).toBe(expectedVersion);
      await patch(owner, memberUrl(record.id), "submit", expectedVersion, { fingerprint: "0".repeat(64) }, 409);
      await patch(owner, memberUrl(record.id), "submit", expectedVersion, { fingerprint: publication.fingerprint });
      return (await read(record.id)).id!;
    };
    const preview = async (id: string, reviewer: Member, workspace: string, version: number) => {
      const key = randomUUID();
      const packet = await staff(id, reviewer, workspace, "review", "inspect", version, {}, 200, key);
      expect(packet.snapshot?.findingExplanation).toBe("Private explanation");
      expect(await staff(id, reviewer, workspace, "review", "inspect", version, {}, 200, key)).toEqual(packet);
      return packet;
    };
    const assign = (id: string, actor: Member, version: number, status: number | number[] = 200) =>
      staff(id, founder, admin, "admin", "assign", version, { target: actor.id,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, status);

    await draft(partial, 0, "January classroom sessions");
    const id = await submit(partial, 1);
    expect(await results()).toEqual([]);
    const queue = await call<OutcomePage<OutcomePublicationSummary>>(founder, root + "?lane=admin&department=" + department +
      "&status=submitted", 200, { workspace: admin });
    expect(queue.items[0]).toMatchObject({ id, title: "January classroom sessions" });
    await assign(id, evidence, 2, 403);
    await assign(id, first, 2);
    const accepted = await staff(id, first, firstSpace, "review", "accept", 3, { conflictFree: true });
    await staff(id, founder, admin, "admin", "approve", accepted.version, { faithful: true }, 403);
    await staff(id, first, firstSpace, "review", "approve", accepted.version, { faithful: true }, 403);
    const packet = await preview(id, first, firstSpace, accepted.version);
    expect(packet.snapshot?.disclosure).toMatchObject({ reportedQuantity: 6, supportedQuantity: 0 });
    const approved = await staff(id, first, firstSpace, "review", "approve", packet.version, { faithful: true });
    const publicResults = await results();
    expect(publicResults).toHaveLength(1);
    expect(publicResults[0]).toEqual({ ...packet.snapshot?.disclosure, publishedOn: expect.any(String) });
    expect(JSON.stringify(publicResults)).not.toMatch(/Private explanation|https?:|methodology|evidenceId|reviewer/);
    await page.goto("/projects/" + project);
    await expect(page.getByText("January classroom sessions", { exact: true })).toBeVisible();
    await patch(owner, memberUrl(partial.id), "withdraw", approved.version);
    await expect(page.getByText("January classroom sessions", { exact: true })).toHaveCount(0, { timeout: 16_000 });
    expect(await results()).toEqual([]);
    await draft(partial, approved.version + 1, "Corrected classroom sessions");
    await submit(partial, approved.version + 2);
    const next = await assign(id, first, approved.version + 3);
    const nextAcceptance = await staff(id, first, firstSpace, "review", "accept", next.version, { conflictFree: true });
    const revision = await preview(id, first, firstSpace, nextAcceptance.version);
    expect(revision.snapshot?.disclosure.corrected).toBe(true);
    await staff(id, first, firstSpace, "review", "approve", revision.version, { faithful: true });
    sql(`update private.community_projects set directory_published_at=null where id='${project}';
      update private.community_projects set directory_published_at=now() where id='${project}';`);
    expect(await results()).toEqual([]);
    expect((await read(partial.id)).status).toBe("invalidated");

    await draft(supported, 0, "Classroom outcomes");
    const contested = await submit(supported, 1);
    await assign(contested, first, 2);
    const accepted2 = await staff(contested, first, firstSpace, "review", "accept", 3, { conflictFree: true });
    const packet2 = await preview(contested, first, firstSpace, accepted2.version);
    const rejected = await staff(contested, first, firstSpace, "review", "reject", packet2.version);
    expect((await read(supported.id)).history.find((event) => event.action === "reject")?.note).toBe(reason.note);
    const appealed = await patch(owner, memberUrl(supported.id), "appeal", rejected.version);
    await assign(contested, first, appealed.version, 403);
    const appealAssignment = await assign(contested, second, appealed.version);
    const appealAcceptance = await staff(contested, second, secondSpace, "review", "accept", appealAssignment.version, { conflictFree: true });
    const appealPacket = await preview(contested, second, secondSpace, appealAcceptance.version);
    expect(appealPacket.snapshot?.rejectionReason).toBe(reason.note);
    const final = await staff(contested, second, secondSpace, "review", "approve", appealPacket.version, { faithful: true });
    await patch(owner, memberUrl(supported.id), "appeal", final.version, {}, 409);
    expect(await results()).toHaveLength(1);
    sql(`update private.c22_releases set revoked_at=now() where case_id='${supported.id}';`);
    expect(await results()).toEqual([]);
    expect((await read(supported.id)).status).toBe("invalidated");
    expect(sql("select count(*) from private.c23_events where action='approve';")).toBe("3");
  } finally {
    sql(`delete from private.c23_fixture; delete from private.c22_fixture; delete from private.c21_outcome_fixture;
      delete from private.platform_bootstrap where user_id='${founderAccount.id}';`);
  }
});
