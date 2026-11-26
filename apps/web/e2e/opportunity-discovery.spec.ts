import { randomUUID } from "node:crypto";
import { professionalOpportunityTypes, volunteerDepartments } from "@ayinou/shared";
import { discoveryOpportunityCopy } from "../src/lib/opportunity-discovery-i18n";
import { api, enroll, expect, finishPersonalOnboarding, login, solveMfa, sql, test, web, type Member } from "./fixtures";

const directory = "/api/v1/me/opportunity-discovery";
const settings = "/api/v1/admin/opportunity-settings/discovery";
const dates = "current_date+30";

async function read(path: string, member?: Member, status = 200, body?: object, workspace?: string) {
  const response = await fetch(api + path, {
    method: body ? "PATCH" : "GET",
    headers: {
      ...(member ? { Authorization: "Bearer " + member.token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(workspace ? { "X-Ayinou-Workspace": workspace } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  expect(response.status, path + " " + raw).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return JSON.parse(raw);
}

test("C4.5 Founder preparation is available while member intake remains closed", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(90000);
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  finishPersonalOnboarding(signedIn);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable founder');`);
  try {
    await read(directory, undefined, 401);
    await read(settings, signedIn, 403);
    const secret = await enroll(founder);
    await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
    await login(page, founder);
    await solveMfa(page, secret);
    await page.goto("/admin?section=opportunitySettings");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page.getByRole("heading", { name: discoveryOpportunityCopy("en")("settings") })).toBeVisible();
    await page.goto("/opportunities");
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      const t = discoveryOpportunityCopy(locale);
      const width = locale === "en" ? 1440 : 390;
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByRole("link", { name: t("latest"), exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("status").filter({ hasText: t("closed") })).toBeVisible();
      await page.getByRole("link", { name: t("saved"), exact: true }).press("Enter");
      await expect(page).toHaveURL(/view=saved/);
      await page.reload();
      await expect(page.getByRole("link", { name: t("saved"), exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width);
      await page.goto("/opportunities");
    }
  } finally {
    sql("delete from private.platform_bootstrap;");
  }
});

test("C4.5 lists exact eligible revisions and isolates recommendations, saves and consent", async ({ signedIn, makeMember }) => {
  test.setTimeout(240000);
  const owner = await makeMember(), other = await makeMember(), member = signedIn;
  [owner, other, member].forEach(finishPersonalOnboarding);
  const organization = randomUUID();
  const tag = "discoveryc45" + organization.slice(0, 8);
  const caseRows = [...volunteerDepartments.map((department, index) => ({ department, type: professionalOpportunityTypes[index % 7] })),
    { department: null, type: "workshop" }].map((location, index) => ({ ...location, id: randomUUID(), index }));
  sql(`begin;
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${owner.id}','identity','verified','review','${other.id}',now());
    insert into private.organizations(id,handle,name,kind,country_code,created_by,verification_status)
      values('${organization}','c45-${organization.slice(0,8)}','Disposable discovery organization','education','HT','${owner.id}','verified');
    insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${owner.id}','owner');
    insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
      values('${owner.id}','${organization}','organization','approved',now());
    insert into private.c41_fixture values(true); insert into private.c42_fixture values(true);
    insert into private.c45_fixture default values;
    ${caseRows.map(row => {
      const country = row.department ? "HT" : "CA";
      const snapshot = JSON.stringify({
        title: tag + " " + row.type,
        description: "Disposable AyiNou evidence fixture",
        type: row.type, category: row.type === "employment" ? "professional" : "educational",
        language: "ht", country, department: row.department, mode: ["remote", "hybrid", "on_site"][row.index % 3],
        applicationMethod: "expression_of_interest", skills: [{ code: "literacy_tutoring" }],
        references: ["https://private.invalid/evidence"],
        details: row.type === "employment"
          ? { compensation: { state: "range", min: 100, max: 180, currency: "HTG" }, compensationPeriod: "day", employmentType: "part_time", experience: "2 years" }
          : row.type === "scholarship" ? { funding: "partial" } : {},
      });
      return `
      insert into private.c41_opportunities(id,organization_id,representative,version,status,created_at)
        values('${row.id}','${organization}','${owner.id}',1,'published',now()-interval '1 day');
      insert into private.c41_revisions(organization_id,opportunity_id,version,status,revised_by,representative,action,snapshot,request_id,fingerprint)
        values('${organization}','${row.id}',1,'draft','${owner.id}','${owner.id}','create',
          '${snapshot}'::jsonb||jsonb_build_object('closesOn',${dates}+${row.index}),gen_random_uuid(),'disposable-c45');
      insert into private.c42_cases(opportunity,revision,submitted_by,state) values('${row.id}',1,'${owner.id}','approved');
      insert into private.c42_publications(opportunity,revision,organization,responsible,published_by,published_at)
        values('${row.id}',1,'${organization}','${owner.id}','${owner.id}',now()-make_interval(mins=>${row.index}));
      `;
    }).join("")}
  commit;`);
  try {
    const search = directory + "?keyword=" + tag;
    const query = (suffix: string, who = member) => read(search + suffix, who);
    const latest = await query("");
    expect(latest.state).toBe("available");
    expect(latest.items.map((item: { id: string }) => item.id), sql(`select json_build_object(
      'keys',(select count(*) from private.c45_listing_keys where opportunity='${caseRows[0].id}'),
      'eligible', private.c42_publication_eligible(p,r.snapshot),
      'keyword', private.c45_document(r.snapshot)@@plainto_tsquery('simple','${tag}'))
      from private.c42_publications p join private.c41_revisions r on r.opportunity_id=p.opportunity and r.version=p.revision
      where p.opportunity='${caseRows[0].id}';`)).toEqual(caseRows.map(row => row.id));
    expect(latest.items[0]).toMatchObject({ revision: 1, status: "published", verified: true, methods: { interest: true } });
    expect(JSON.stringify(latest)).not.toContain("private.invalid");
    expect((await query("&sort=closing")).items[0].id).toBe(caseRows[0].id);
    for (const row of caseRows) {
      const filter = row.department ? "&department=" + row.department : "&country=CA";
      expect((await query(filter)).items).toEqual([expect.objectContaining({ id: row.id })]);
    }
    expect((await query("&type=employment&employmentType=part_time")).items).toHaveLength(2);
    expect((await query("&type=scholarship&funding=partial")).items).toHaveLength(2);
    await read(search + "&type=workshop&employmentType=part_time", member, 400);
    await read(search + "&view=forYou&sort=relevance", member, 200).then(view => expect(view.state).toBe("personalization_disabled"));
    const preferences = await read(directory + "/preferences", member);
    expect(await read(directory + "/import", member)).toEqual([]);
    sql(`insert into private.c31_profiles(actor,version,summary,languages,mode,commitment,departments,nationwide,availability)
      values('${member.id}',1,'Disposable profile','["ht"]','remote','occasional','{}',true,'available');
      insert into private.c31_selections(actor,code,proficiency) values('${member.id}','literacy_tutoring','intermediate');`);
    expect(await read(directory + "/import", member)).toEqual([expect.objectContaining({
      source: "volunteer", version: 1, code: "literacy_tutoring",
    })]);
    expect(await read(directory + "/import", other)).toEqual([]);
    expect((await read(directory + "/skills?q=literacy", member)).map((skill: { code: string }) => skill.code)).toContain("literacy_tutoring");
    let version = 0;
    const command = async (body: object) => {
      const response = await read(directory, member, 200, { requestId: randomUUID(), expectedVersion: version, ...body });
      version = response.version;
    };
    const save = { action: "save", id: caseRows[0].id, revision: 1, requestId: randomUUID(), expectedVersion: 0 };
    expect(await read(directory, member, 200, save)).toEqual({ version: 1 });
    expect(await read(directory, member, 200, save)).toEqual({ version: 1 });
    version = 1;
    await read(directory, member, 409, { ...save, requestId: randomUUID() });
    expect((await read(directory + "?view=saved", other)).items).toEqual([]);
    expect((await read(directory + "?view=saved", member)).items).toHaveLength(1);
    await command({ action: "save_preferences", expiresOn: null, preferences: {
      ...preferences.preferences, types: ["employment"], modes: ["remote"], experience: 3, languages: ["ht"],
      compensation: { minimum: 120, currency: "HTG", period: "day" },
    }, import: { source: "volunteer", version: 1, codes: ["literacy_tutoring"], confirmed: true } });
    expect((await read(directory + "/preferences", member)).preferences.skills).toEqual([
      { code: "literacy_tutoring", proficiency: "intermediate" },
    ]);
    expect(sql(`select version from private.c31_profiles where actor='${member.id}';`)).toBe("1");
    expect((await read(directory + "/preferences", other)).preferences).toEqual(preferences.preferences);
    await command({ action: "opt_in", confirmed: true });
    const recommendations = "&view=forYou&sort=relevance";
    expect((await query(recommendations)).items[0]).toMatchObject({ id: caseRows[0].id,
      reasons: expect.arrayContaining(["skillFit", "remoteFit", "typeFit", "experienceFits", "amountOverlaps"]) });
    await command({ action: "dismiss", id: caseRows[0].id, revision: 1 });
    expect((await query(recommendations)).items.map((item: { id: string }) => item.id)).not.toContain(caseRows[0].id);
    expect((await query("")).items).toHaveLength(caseRows.length);
    await command({ action: "reset", confirmed: true });
    expect((await query(recommendations)).items[0].id).toBe(caseRows[0].id);
    await command({ action: "withdraw", confirmed: true });
    const afterWithdrawal = await Promise.all([query(recommendations), query(""), read(directory + "?view=saved", member)]);
    expect(afterWithdrawal[0].state).toBe("personalization_disabled");
    expect(afterWithdrawal[1].items).toHaveLength(caseRows.length);
    expect(afterWithdrawal[2].items).toHaveLength(1);
    sql(`insert into feed_data.member_blocks(actor_id,target_id) values('${member.id}','${owner.id}');`);
    expect((await query("")).items).toEqual([]);
    sql(`delete from feed_data.member_blocks where actor_id='${member.id}' and target_id='${owner.id}';`);
    sql(`update private.organizations set verification_status='revoked' where id='${organization}';`);
    expect((await read(directory + "?view=saved", member)).items).toEqual([{ id: caseRows[0].id, unavailable: true, saved: true }]);
    sql(`update private.organizations set verification_status='verified' where id='${organization}';`);
    expect((await query("")).items).toEqual([]);
    await command({ action: "unsave", id: caseRows[0].id });
    expect((await read(directory + "?view=saved", member)).items).toEqual([]);
    await benchmark(other, organization, owner);
    expect(sql(`select has_function_privilege('service_role','public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','execute')
      and not has_function_privilege('authenticated','public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','execute')
      and not has_table_privilege('service_role','private.c45_preferences','select');`)).toBe("t");
  } finally {
    sql("delete from private.c45_fixture; delete from private.c42_fixture; delete from private.c41_fixture;");
  }
});

async function benchmark(member: Member, organization: string, owner: Member) {
  const keyword = "latencyc45";
  const preferences = (await read(directory + "/preferences", member)).preferences;
  await read(directory, member, 200, { action: "save_preferences", expiresOn: null, requestId: randomUUID(),
    expectedVersion: 0, preferences: { ...preferences, types: ["employment"] } });
  await read(directory, member, 200, { action: "opt_in", confirmed: true, expectedVersion: 1, requestId: randomUUID() });
  const profile = "keyword=" + keyword;
  const cases = professionalOpportunityTypes.join(",");
  const departments = volunteerDepartments.join(",");
  const table = [];
  let previous = 0;
  for (const population of [1000, 10000, 50000, 100000]) {
    for (let start = previous + 1; start <= population; start += 5000) {
      const end = Math.min(start + 4999, population);
      sql(`begin;
        create temporary table c45_benchmark on commit drop as
        select gen_random_uuid() as id,i, (string_to_array('${cases}',','))[1+(i%7)] as kind,
          (string_to_array('${departments}',','))[1+(i%10)] as department
        from generate_series(${start},${end}) i;
        insert into private.c41_opportunities(id,organization_id,representative,version,status)
          select id,'${organization}','${owner.id}',1,case when i%10=1 then 'restricted' else 'published' end from c45_benchmark;
        insert into private.c41_revisions(organization_id,opportunity_id,version,status,revised_by,representative,action,snapshot,request_id,fingerprint)
          select '${organization}',id,1,'draft','${owner.id}','${owner.id}','create',
            jsonb_build_object('title','${keyword} '||kind,'description',case when i%20=0 then 'Rare benchmark search' else 'Disposable benchmark' end,
              'type',kind,'country',case when i%4=0 then 'CA' else 'HT' end,'department',case when i%4<>0 then department end,
              'mode',(array['remote','hybrid','on_site'])[1+(i%3)],'category','professional','language','ht',
              'closesOn',current_date+case when i%10=2 then -1 else 30+i%21 end,'applicationMethod','expression_of_interest'),
            gen_random_uuid(),'disposable-benchmark' from c45_benchmark;
        insert into private.c42_cases(opportunity,revision,submitted_by,state)
          select id,1,'${owner.id}','approved' from c45_benchmark;
        insert into private.c42_publications(opportunity,revision,organization,responsible,published_by,published_at,suppressed_at)
          select id,1,'${organization}','${owner.id}','${owner.id}',now()-make_interval(secs=>i),
            case when i%10=1 then now() end from c45_benchmark;
        commit;`);
    }
    previous = population;
    sql("analyze private.c45_listing_keys;");
    const browse = (query = "") => read(directory + (query ? "?" + query : ""), member);
    const saved = await browse("view=saved");
    const latest = await browse(profile);
    if (!saved.items.length) {
      await read(directory, member, 200, { action: "save", id: latest.items[0].id, revision: 1, expectedVersion: 2, requestId: randomUUID() });
    }
    const scopes = [
      ["latest", ""], ["keyword", "keyword=rare"],
      ["filtered", "type=employment&country=CA&sort=closing"],
      ["personalized", profile + "&view=forYou&sort=relevance"], ["saved", "view=saved"],
    ] as const;
    const samples: Record<string, { ms: number[]; bytes: number }> = {};
    for (const [name, query] of scopes) {
      const elapsed = [];
      let bytes = 0;
      for (let attempt = 0; attempt < (population >= 50000 ? 2 : 1); attempt++) {
        const start = performance.now();
        const result = await browse(query);
        elapsed.push(Math.round(performance.now() - start));
        bytes = Buffer.byteLength(JSON.stringify(result));
        expect(result.items.length).toBeGreaterThan(0);
      }
      samples[name] = { ms: elapsed, bytes };
    }
    const reference = sql(`select coalesce(jsonb_agg(id order by published_at desc,id desc),'[]') from (
      select k.opportunity id,k.published_at from private.c45_listing_keys k
      where k.kind='employment' and k.closing>=current_date and k.document@@plainto_tsquery('simple','${keyword}')
      order by k.published_at desc,k.opportunity desc limit 12
    ) eligible;`);
    const started = performance.now();
    const parallel = await Promise.all([browse(profile + "&view=forYou&sort=relevance"), browse("keyword=rare"), browse("view=saved")]);
    const concurrentMs = Math.round(performance.now() - started);
    const expected = JSON.parse(reference) as string[];
    const actual = parallel[0].items.map((item: { id: string }) => item.id);
    const recall = actual.filter((id: string) => expected.includes(id)).length / expected.length;
    expect(recall).toBeGreaterThan(0);
    const explain = sql("explain (analyze, buffers) select opportunity from private.c45_listing_keys where closing>=current_date order by published_at desc,opportunity desc limit 129;");
    table.push({ population, samples, concurrentMs, recall,
      latestIndex: explain.includes("using c45_latest"),
      indexedSqlMs: explain.match(/Execution Time: ([\d.]+)/)?.[1],
    });
  }
  console.log("C4.5 disposable scale " + JSON.stringify(table));
}
