import { randomUUID } from "node:crypto";
import { volunteerDepartments, type MentorshipFounderView, type MentorshipOwnerView, type MentorshipPreferences } from "@ayinou/shared";
import { mentorshipCopy } from "../src/lib/mentorship-i18n";
import { coordinationCopy } from "../src/lib/mentorship-coordination-i18n";
import { volunteerCategory } from "../src/lib/volunteer-i18n";
import { api, enroll, expect, finishPersonalOnboarding, localClient, login, solveMfa, sql, test, totp, web, type Member } from "./fixtures";

const ownerPath = "/api/v1/me/mentorship";
const adminPath = "/api/v1/admin/opportunity-settings/mentorship";
const webPath = "/settings/opportunities/mentorship";
const skill = "literacy_tutoring";
const consent = { recommendations: true, discovery: false, requests: true };
const preferences: MentorshipPreferences = {
  topics: ["educational_guidance"], skills: [{ code: skill, proficiency: "beginner" }],
  languages: [{ code: "ht", proficiency: "advanced" }], mode: "hybrid", geography: "haiti_departments",
  departments: [...volunteerDepartments], countries: [], weeklyHours: 3, sessionMinutes: 30, durationWeeks: 8,
  capacity: null, expiresOn: null, summary: "", experience: null, goals: "", learningObjectives: "Practice designing reading activities.",
};
const mentor: MentorshipPreferences = { ...preferences, mode: "remote", geography: "worldwide_remote", departments: [],
  capacity: 4, learningObjectives: "", skills: [{ code: skill, proficiency: "advanced" }] };
const receipt = (role: "mentor" | "mentee", expectedVersion = 0) => ({ requestId: randomUUID(), expectedVersion, role });
const save = (role: "mentor" | "mentee", version: number, value: MentorshipPreferences) => ({
  ...receipt(role, version), action: "save", preferences: value, consent, adult: true, participation: true, safeguarding: true,
});
async function call(path: string, status: number, member?: Member, body?: object, workspace?: string, origin = api) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(12_000), method: body ? "PATCH" : "GET",
    headers: { ...(member && { Authorization: "Bearer " + member.token }),
      ...(body && { "Content-Type": "application/json" }), ...(workspace && { "X-Ayinou-Workspace": workspace }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  expect(response.status, path + " " + JSON.stringify(result)).toBe(status);
  if (status !== 404) expect(response.headers.get("cache-control")).toContain("no-store");
  return result;
}

test("C4.3 isolates mentor and mentee profiles, consent, import and concurrent revisions", async ({ signedIn, makeMember }) => {
  test.setTimeout(100_000);
  const ordinary = signedIn;
  const independent = await makeMember();
  const outsider = await makeMember();
  const unonboarded = await makeMember();
  for (const user of [ordinary, independent, outsider]) finishPersonalOnboarding(user);
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values('${independent.id}','identity','verified','review','${outsider.id}',now());`);
  await call(ownerPath, 401);
  const guestPage = await fetch(web + webPath, { redirect: "manual" });
  expect(guestPage.status).toBe(307);
  expect(guestPage.headers.get("cache-control")).toContain("no-store");
  expect(guestPage.headers.get("x-robots-tag")).toContain("noindex");
  expect(guestPage.headers.get("referrer-policy")).toBe("no-referrer");
  await call(adminPath, 403, ordinary);
  expect(await call(ownerPath, 200, ordinary)).toMatchObject({ intake: false, profiles: [], volunteerSkills: [] });
  await call(ownerPath + "/skills?q=reading", 403, ordinary);
  await call(ownerPath, 403, ordinary, save("mentee", 0, preferences));
  expect(sql(`select count(*)=5 and bool_and(relrowsecurity and not exists(select from
    unnest(array['anon','authenticated','authenticator','service_role']) role
    where has_table_privilege(role,c.oid,'SELECT,INSERT,UPDATE,DELETE')
      or has_any_column_privilege(role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    from pg_class c where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname like 'c43_%';`)).toBe("t");
  expect(sql(`select not has_function_privilege('authenticated','public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)','EXECUTE');`)).toBe("t");
  sql(`insert into private.c43_fixture values(true);
    insert into private.c31_profiles(actor,version,summary,languages,mode,commitment,departments,nationwide,availability)
      values('${ordinary.id}',1,'VOLUNTEER_FIXTURE','[]','remote','one_three','{}',true,'available');
    insert into private.c31_selections(actor,code,proficiency,experience)
      values('${ordinary.id}','${skill}','advanced',9);
    insert into private.c31_consents(actor,matching,discovery,profile_display) values('${ordinary.id}',true,false,true);`);
  const volunteerBefore = sql(`select to_jsonb(v)::text from private.c31_selections v where actor='${ordinary.id}';`);
  try {
    await call(ownerPath, 403, ordinary, save("mentor", 0, mentor));
    await call(ownerPath, 400, ordinary, { ...save("mentee", 0, preferences), adult: false });
    await call(ownerPath, 400, ordinary, { ...save("mentee", 0, preferences), safeguarding: false });
    await call(ownerPath, 400, ordinary, { ...save("mentee", 0, preferences), participation: false });
    await call(ownerPath, 400, ordinary, { ...save("mentee", 0, preferences), consent: { ...consent, public: true } });
    await call(ownerPath, 400, ordinary, { ...save("mentee", 0, preferences), actor: independent.id });
    await call(ownerPath + "?actor=" + independent.id, 400, ordinary);
    await call(ownerPath + "/" + independent.id, 404, ordinary);
    expect(await call(ownerPath, 200, ordinary)).toMatchObject({ intake: true, mentorIdentity: false, profiles: [],
      volunteerSkills: [{ code: skill }] });
    await call(ownerPath, 400, outsider, { ...save("mentee", 0, preferences), importSkills: [skill] });
    const options = await call(ownerPath + "/skills?q=literacy", 200, ordinary);
    expect(options).toContainEqual(expect.objectContaining({ code: skill }));
    expect(options.length).toBeLessThanOrEqual(25);
    sql("update private.member_experience_policy set value=jsonb_set(value,'{requireCompletion}','true');");
    try { await call(ownerPath, 403, unonboarded, save("mentee", 0, preferences)); }
    finally { sql("update private.member_experience_policy set value=private.member_experience_defaults();"); }
    const menteeCommand = { ...save("mentee", 0, preferences), importSkills: [skill] };
    const [mentee, replay] = await Promise.all([
      call(ownerPath, 200, ordinary, menteeCommand),
      call(ownerPath, 200, ordinary, menteeCommand, undefined, "http://127.0.0.1:5301"),
    ]);
    expect(mentee).toEqual(replay);
    expect(sql(`select to_jsonb(v)::text from private.c31_selections v where actor='${ordinary.id}';`)).toBe(volunteerBefore);
    const model: MentorshipOwnerView = await call(ownerPath, 200, ordinary);
    expect(model.profiles).toMatchObject([{ id: mentee.id, status: "available", consent: { ...consent, public: false },
      preferences: { departments: [...volunteerDepartments], skills: [{ code: skill, proficiency: "beginner" }] } }]);
    expect(await call(ownerPath, 200, outsider)).toMatchObject({ profiles: [], volunteerSkills: [] });
    await call(ownerPath, 400, independent, save("mentor", 0, { ...mentor, capacity: 9 }));
    await call(ownerPath, 400, independent, save("mentor", 0, { ...mentor, mode: "hybrid" }));
    await call(ownerPath, 400, independent, save("mentor", 0, { ...mentor, skills: [...mentor.skills, ...mentor.skills] }));
    const createdMentor = await call(ownerPath, 200, independent, save("mentor", 0, mentor));
    const international = { ...preferences, geography: "international" as const, departments: [], countries: ["CA", "DO"], expiresOn: "2020-01-01" };
    await call(ownerPath, 400, independent, save("mentee", 0, { ...international, countries: ["XX"] }));
    await call(ownerPath, 200, independent, save("mentee", 0, international));
    expect(await call(ownerPath, 200, independent)).toMatchObject({ mentorIdentity: true, profiles: [
      { role: "mentee", status: "expired", preferences: { countries: ["CA", "DO"] } },
      { role: "mentor", status: "available", id: createdMentor.id, preferences: { geography: "worldwide_remote", capacity: 4 } },
    ] });
    await call(ownerPath, 200, independent, { ...receipt("mentor", 1), action: "pause" });
    await call(ownerPath, 200, independent, { ...receipt("mentor", 2), action: "resume" });
    await call(ownerPath, 200, independent, { ...receipt("mentor", 3), action: "withdraw", purpose: "recommendations" });
    expect(await call(ownerPath, 200, independent)).toMatchObject({ profiles: [
      { role: "mentee", status: "expired", consent: { recommendations: true } },
      { role: "mentor", status: "available", consent: { recommendations: false, requests: true } },
    ] });
    sql(`update public.user_settings set discoverable=false where user_id='${independent.id}';
      insert into feed_data.member_blocks(actor_id,target_id) values('${independent.id}','${outsider.id}');`);
    expect(await call(ownerPath, 200, independent)).toMatchObject({ nativeDiscovery: false });
    expect(await call(ownerPath, 200, outsider)).toMatchObject({ profiles: [] });
    sql(`insert into private.account_restrictions(user_id,status,reason)
      values('${independent.id}','suspended','Disposable mentorship account standing check');`);
    try { await call(ownerPath, 401, independent, { ...receipt("mentor", 4), action: "resume" }); }
    finally { sql(`delete from private.account_restrictions where user_id='${independent.id}';`); }
    sql(`update private.c31_skills set status='retired',version=version+1 where code='${skill}';`);
    expect(await call(ownerPath + "/skills?q=literacy", 200, ordinary)).toEqual([]);
    await call(ownerPath, 400, outsider, save("mentee", 0, preferences));
    await call(ownerPath, 200, ordinary, save("mentee", 1, preferences));
    expect(await call(ownerPath, 200, ordinary)).toMatchObject({ profiles: [{ skills: [{ status: "retired", selectedVersion: 1 }] }] });
    const contenders = await Promise.all([
      fetch(api + ownerPath, { method: "PATCH", headers: { Authorization: "Bearer " + ordinary.token, "Content-Type": "application/json" },
        body: JSON.stringify({ ...receipt("mentee", 2), action: "pause" }) }),
      fetch("http://127.0.0.1:5301" + ownerPath, { method: "PATCH", headers: { Authorization: "Bearer " + ordinary.token, "Content-Type": "application/json" },
        body: JSON.stringify({ ...receipt("mentee", 2), action: "withdraw", purpose: "requests" }) }),
    ]);
    expect(contenders.map(response => response.status).sort()).toEqual([200, 409]);
    sql("delete from private.c43_fixture;");
    await call(ownerPath, 403, ordinary, { ...receipt("mentee", 3), action: "resume" });
    await call(ownerPath, 200, ordinary, { ...receipt("mentee", 3), action: "withdraw" });
    expect(await call(ownerPath, 200, ordinary)).toMatchObject({ intake: false, profiles: [
      { role: "mentee", paused: true, participation: false, consent: { recommendations: false, discovery: false, requests: false, public: false } },
    ] });
  } finally {
    sql(`delete from private.c43_fixture; delete from private.c43_profiles;
      delete from private.c31_profiles where actor='${ordinary.id}';
      update private.c31_skills set status='active',version=1 where code='${skill}';`);
  }
});

test("C4.3 Founder preparation works with live intake closed and member navigation is localized", async ({ page, context, makeMember }) => {
  test.setTimeout(95_000);
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable mentorship founder');`);
  try {
    const secret = await enroll(founder);
    const auth = localClient("AYINOU_E2E_SUPABASE_PUBLIC").auth;
    expect((await auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
    const factor = (await auth.mfa.listFactors()).data!.totp[0];
    const proof = (await auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) })).data!;
    const elevated = { ...founder, token: proof.access_token };
    const opened = await fetch(api + "/api/v1/me/private-workflows", { method: "POST",
      headers: { Authorization: "Bearer " + elevated.token, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "admin_workspace" }) });
    expect(opened.status).toBe(200);
    const workspace = (await opened.json()).id;
    const coordinationPath = adminPath + "/coordination";
    const preparedCoordination = await call(coordinationPath, 200, elevated, undefined, workspace);
    expect(preparedCoordination).toMatchObject({ version:0, live:false, stages:{
      intake:false,matching:false,discovery:false,requests:false,coordination:false,
    }});
    const prepareCoordination = { requestId:randomUUID(),expectedVersion:0,confirmed:true,
      reason:"Prepare the disposable coordination limits.",settings:preparedCoordination.settings };
    await call(coordinationPath,400,elevated,{...prepareCoordination,enabled:true},workspace);
    await call(coordinationPath,403,elevated,prepareCoordination,randomUUID());
    expect(await call(coordinationPath,200,elevated,prepareCoordination,workspace)).toEqual({version:1});
    expect(await call(coordinationPath,200,elevated,prepareCoordination,workspace)).toEqual({version:1});
    await call(coordinationPath,409,elevated,{...prepareCoordination,requestId:randomUUID()},workspace);
    const current: MentorshipFounderView = await call(adminPath, 200, elevated, undefined, workspace);
    expect(current).toMatchObject({ version: 0, live: false, history: [] });
    expect(current).not.toHaveProperty("profiles");
    const settings = { requestId: randomUUID(), expectedVersion: 0, confirmed: true, configuration: current.configuration,
      reason: "Prepare mentoring for the disposable review.", readinessNotes: "Intake closed", safeguardingPlan: "Adult guidance only" };
    await call(adminPath, 400, elevated, { ...settings, live: true }, workspace);
    await call(adminPath, 403, elevated, settings, randomUUID());
    expect(await call(adminPath, 200, elevated, settings, workspace)).toEqual({ version: 1 });
    expect(await call(adminPath, 200, elevated, settings, workspace)).toEqual({ version: 1 });
    await call(adminPath, 409, elevated, { ...settings, requestId: randomUUID() }, workspace);
    expect(await call(ownerPath, 200, elevated)).toMatchObject({ intake: false, mentorIdentity: false, profiles: [] });
    await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
    await login(page, founder);
    await solveMfa(page, secret);
    await page.goto("/admin?section=opportunitySettings");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mentorship preparation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: coordinationCopy("en")("founder"), exact: true })).toBeVisible();
    await expect(page.getByText(mentorshipCopy("en")("activation"), { exact: true })).toBeVisible();
    const settingsForms = page.locator('details[name="opportunity-configuration"]');
    const mentorshipForm = settingsForms.filter({ hasText: "Supported skill categories" });
    await page.setViewportSize({ width: 390, height: 900 });
    await mentorshipForm.locator(":scope > summary").press("Enter");
    await expect(mentorshipForm.locator("fieldset").first()).toBeHidden();
    await mentorshipForm.locator("summary").filter({ hasText: "Supported skill categories" }).click();
    await expect(mentorshipForm.getByRole("checkbox", { name: volunteerCategory("education", "en"), exact: true })).toBeVisible();
    expect(await mentorshipForm.locator("form").evaluate(form => new FormData(form as HTMLFormElement).getAll("roles")))
      .toEqual(["mentor", "mentee"]);
    expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(390);
    await settingsForms.first().locator(":scope > summary").click();
    await expect(mentorshipForm).not.toHaveAttribute("open");
    await expect(settingsForms.first()).toHaveAttribute("open", "");

    await page.goto("/settings");
    await page.getByRole("link", { name: /Mentorship profiles/ }).click();
    await expect(page).toHaveURL(new RegExp(webPath + "$"));
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      const width = locale === "en" ? 1440 : 390;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(webPath);
      const t = mentorshipCopy(locale);
      await expect(page.getByRole("heading", { name: t("title"), exact: true })).toBeVisible();
      await expect(page.getByText(t("closed"), { exact: true })).toBeVisible();
      expect(await page.getByRole("button", { name: t("save") }).count()).toBe(0);
      await page.getByRole("link", { name: coordinationCopy(locale)("title"), exact:true }).click();
      await expect(page.getByText(coordinationCopy(locale)("closed"), {exact:true})).toBeVisible();
      await expect(page.getByRole("button", {name:coordinationCopy(locale)("send")})).toHaveCount(0);
      expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width);
      await page.getByRole("link", {name:coordinationCopy(locale)("profile"),exact:true}).click();
      await expect(page).toHaveURL(new RegExp(webPath + "$"));
      expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width);
    }
  } finally {
    sql("delete from private.c44_preparation; delete from private.c43_admin_history; delete from private.c43_settings; delete from private.platform_bootstrap;");
  }
});


test("C4.3 member editor saves private preferences and measures bounded reads", async ({ page, context, signedIn }) => {
  test.setTimeout(80_000);
  finishPersonalOnboarding(signedIn);
  sql("insert into private.c43_fixture values(true);");
  try {
    await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
    await page.setViewportSize({ width: 390, height: 920 });
    await page.goto(webPath);
    const mentee = page.locator("section").filter({ has: page.getByRole("heading", { name: "Mentee", exact: true }) });
    await mentee.getByText("Set up profile", { exact: true }).press("Enter");
    await mentee.getByRole("searchbox", { name: "Filter topics" }).fill("educational");
    await mentee.getByRole("checkbox", { name: "Educational guidance" }).check();
    await mentee.getByRole("textbox", { name: "Learning objectives" }).fill(preferences.learningObjectives);
    await mentee.getByRole("searchbox", { name: "Search the skills catalog" }).fill("literacy");
    await mentee.getByRole("searchbox", { name: "Search the skills catalog" }).press("Enter");
    await mentee.getByRole("button", { name: "Add Literacy tutoring", exact: true }).click();
    await mentee.getByRole("combobox", { name: "Haitian Creole", exact: true }).selectOption("advanced");
    await mentee.getByRole("combobox", { name: "Geographic preference" }).selectOption("haiti_nationwide");
    await mentee.getByRole("checkbox", { name: "I confirm that I am 18 or older." }).check();
    await mentee.getByRole("checkbox", { name: "I freely consent to participate in this role." }).check();
    await mentee.getByRole("checkbox", { name: /I agree to keep guidance/ }).check();
    expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(390);
    await mentee.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Mentorship preferences saved.", { exact: true })).toBeVisible();
    expect(await call(ownerPath, 200, signedIn)).toMatchObject({ profiles: [
      { status: "available", role: "mentee", consent: { recommendations: false, discovery: false, requests: false },
        preferences: { geography: "haiti_nationwide", skills: [{ code: skill }] } },
    ] });

    const snapshot = JSON.stringify({ ...preferences, skills: undefined });
    sql(`begin;
      create temporary table c43_benchmark on commit drop as select gen_random_uuid() id,n from generate_series(1,500) n;
      insert into auth.users(id,email,email_confirmed_at,invited_at,raw_user_meta_data)
        select id,'c43bench'||n||'@disposable.example.invalid',now(),now(),'{"signup_path":"organization"}' from c43_benchmark;
      insert into private.c43_profiles(actor,role,version,preferences,adult_at,participation_at,safeguarding_at,request_id,request_hash)
        select id,'mentee',1,'${snapshot}',now(),now(),now(),gen_random_uuid(),'disposable scale fixture' from c43_benchmark;
      commit;`);
    const codes = sql("select string_agg(code,',' order by code) from (select code from private.c31_skills where status='active' order by code limit 12) s;").split(",");
    expect(codes).toHaveLength(12);
    const maximum = { ...preferences, skills: codes.map(code => ({ code, proficiency: "beginner" as const })) };
    await call(ownerPath, 200, signedIn, save("mentee", 1, maximum));
    const observations = { reads: [] as number[], saves: [] as number[], bytes: 0 };
    for (let index = 0; index < 4; index++) {
      let start = performance.now();
      const resource = await call(ownerPath, 200, signedIn);
      observations.reads.push(Math.round(performance.now() - start));
      observations.bytes = Buffer.byteLength(JSON.stringify(resource));
      expect(resource.profiles).toHaveLength(1);
      expect(resource.profiles[0].skills).toHaveLength(12);
      start = performance.now();
      await call(ownerPath, 200, signedIn, save("mentee", index + 2, { ...maximum, goals: "Practice reading exercise " + index }));
      observations.saves.push(Math.round(performance.now() - start));
    }
    console.log("C4.3 disposable benchmark " + JSON.stringify(observations));
  } finally {
    sql("delete from private.c43_fixture; delete from private.c43_profiles;");
  }
});
