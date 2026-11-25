import { randomUUID } from "node:crypto";
import { volunteerDepartments, type VolunteerAdminView, type VolunteerOwnerView } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, solveMfa, sql, test, totp, web } from "./fixtures";
import { volunteerCopy } from "../src/lib/volunteer-i18n";

const owner = "/api/v1/me/volunteer-profile";
const admin = "/api/v1/admin/volunteer-settings";
const reason = "Prepare the volunteer catalog in the isolated rehearsal.";
const receipt = (action: string, expectedVersion: number) => ({ action, expectedVersion, requestId: randomUUID() });
const preferences = {
  summary: "Private synthetic profile summary",
  skills: [{ code: "literacy_tutoring", proficiency: "intermediate", experience: 4 }],
  languages: [{ code: "ht", proficiency: "advanced" }],
  departments: [...volunteerDepartments], mode: "remote", commitment: "four_eight", nationwide: false,
  availability: "available", expiresOn: null, consent: { matching: false, discovery: true, profileDisplay: false },
};
async function call(path: string, token?: string, body?: object, workspace?: string, method?: string) {
  const response = await fetch(api + path, { method: method ?? (body ? "PATCH" : "GET"), signal: AbortSignal.timeout(10_000),
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      ...(workspace ? { "X-Ayinou-Workspace": workspace } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  return { status: response.status, data, cache: response.headers.get("cache-control") };
}

test("private volunteer profiles enforce eligibility, independent consent and revision checks", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(100_000);
  const outsider = await makeMember();
  const supporter = await makeMember();
  finishPersonalOnboarding(signedIn);
  finishPersonalOnboarding(supporter);
  sql(`update public.member_private set membership_category='international_supporter' where user_id='${supporter.id}';`);
  expect(await call(owner)).toMatchObject({ status: 401, cache: "private, no-store" });
  expect(await call(owner, signedIn.token)).toMatchObject({ status: 200, data: { intake: false, profile: null, catalog: [] } });
  expect(await call(owner, signedIn.token, { ...receipt("save",0), ...preferences })).toMatchObject({ status: 403 });
  expect(await call(admin, signedIn.token)).toMatchObject({ status: 403 });
  expect(sql(`select count(*)=9 and bool_and(c.relrowsecurity and not exists(
    select from unnest(array['anon','authenticated','service_role']) r where
    has_table_privilege(r,c.oid,'select,insert,update,delete'))) from pg_class c
    where relnamespace='private'::regnamespace and relkind='r' and relname like 'c31_%';`)).toBe("t");
  expect(sql(`select not has_function_privilege('authenticated','public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)','EXECUTE')
    and not has_function_privilege('anon','public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)','EXECUTE');`)).toBe("t");
  sql("insert into private.c31_fixture values(true);");
  try {
    const enabled = await call(owner,signedIn.token);
    expect(enabled.data.catalog).toHaveLength(15);
    sql("update private.member_experience_policy set value=jsonb_set(value,'{requireCompletion}','true');");
    try {
      expect(await call(owner,outsider.token,{ ...receipt("save",0), ...preferences })).toMatchObject({ status: 403 });
    } finally { sql("update private.member_experience_policy set value=private.member_experience_defaults();"); }
    expect(await call(owner,signedIn.token,{ ...receipt("save",0), ...preferences, skills: [...preferences.skills,...preferences.skills] })).toMatchObject({ status: 400 });
    expect(await call(owner,signedIn.token,{ ...receipt("save",0), ...preferences, skills: [{ ...preferences.skills[0],experience: 61 }] })).toMatchObject({ status: 400 });
    expect(await call(owner,signedIn.token,{ ...receipt("save",0), ...preferences, languages: [{ code: "bad",proficiency: "advanced" }] })).toMatchObject({ status: 400 });
    const initial = { ...receipt("save",0), ...preferences };
    expect(await call(owner,signedIn.token,initial)).toMatchObject({ status: 200,data: { version: 1 } });
    expect(await call(owner,signedIn.token,initial)).toMatchObject({ status: 200,data: { version: 1 } });
    expect(await call(owner,supporter.token,{ ...receipt("save",0), ...preferences, nationwide: true, departments: [] })).toMatchObject({ status: 200 });
    expect(await call(owner + "?actor=" + signedIn.id,supporter.token)).toMatchObject({ status: 400 });
    sql(`insert into feed_data.member_blocks(actor_id,target_id) values('${signedIn.id}','${supporter.id}');`);
    expect(await call(owner,outsider.token)).toMatchObject({ data: { profile: null } });
    expect(await call(owner + "/" + signedIn.id,supporter.token)).toMatchObject({ status: 404 });
    expect(await call(owner,supporter.token)).toMatchObject({ data: { profile: { nationwide: true, departments: [] } } });
    sql(`insert into private.account_restrictions(user_id,status,reason)
      values('${supporter.id}','suspended','Disposable account standing check');`);
    try {
      expect((await call(owner,supporter.token)).status).toBeGreaterThanOrEqual(400);
      expect((await call(owner,supporter.token,receipt("pause",1))).status).toBeGreaterThanOrEqual(400);
    } finally { sql(`delete from private.account_restrictions where user_id='${supporter.id}';`); }
    const race = await Promise.all([call(owner,signedIn.token,receipt("pause",1)),
      call(owner,signedIn.token,{ ...receipt("save",1), ...preferences, availability: "paused" })]);
    expect(race.map((item) => item.status).sort()).toEqual([200,409]);
    expect(await call(owner,signedIn.token,{ ...receipt("save",2), ...preferences, expiresOn: "2020-01-01" })).toMatchObject({ status: 200 });
    expect(await call(owner,signedIn.token)).toMatchObject({ data: { status: "expired", profile: { consent: preferences.consent } } });
    expect(await call(owner,signedIn.token,{ ...receipt("save",3), ...preferences })).toMatchObject({ status: 200 });

    await inEnglish(context);
    await page.goto("/settings/volunteering");
    await expect(page.getByRole("heading",{ name: "Volunteer profile", exact: true })).toBeVisible();
    await page.getByRole("searchbox",{ name: "Search skills" }).fill("woodworking");
    await page.getByRole("searchbox",{ name: "Search skills" }).press("Tab");
    await page.getByRole("button",{ name: "Add Carpentry", exact: true }).click();
    await expect(page.getByRole("button",{ name: "Remove Carpentry", exact: true })).toBeVisible();
    await page.getByRole("button",{ name: "Save volunteer profile" }).click();
    await expect(page.getByText("Changes saved.",{ exact: true })).toBeVisible();

    sql("delete from private.c31_fixture;");
    const closed = await call(owner,signedIn.token);
    const model = closed.data as VolunteerOwnerView;
    expect(model.intake).toBe(false);
    expect(model.profile?.skills.map(({ code }) => code)).toEqual(["carpentry","literacy_tutoring"]);
    const revision = model.profile!.version;
    expect(await call(owner,signedIn.token,{ ...receipt("withdraw",revision), consentKey: "discovery" })).toMatchObject({ status: 200 });
    expect(await call(owner,signedIn.token,receipt("pause",revision+1))).toMatchObject({ status: 200 });
    expect(await call(owner,signedIn.token)).toMatchObject({ data: { profile: { consent: { matching: false, discovery: false, profileDisplay: false } } } });
    for (const locale of ["en","ht","fr","es"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale,url: web }]);
      const width = locale === "en" ? 1440 : 390;
      await page.setViewportSize({ width,height: 850 });
      await page.reload();
      await expect(page.getByText(volunteerCopy(locale)("closed"),{ exact: true })).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(width);
    }
  } finally {
    sql(`delete from private.c31_fixture; delete from private.c31_profiles where actor in ('${signedIn.id}','${supporter.id}');`);
  }
});

test("Founder can prepare catalog and configuration with intake closed", async ({ page,context,signedIn,makeMember }) => {
  test.setTimeout(100_000);
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  finishPersonalOnboarding(signedIn);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
    values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const key = await enroll(founder);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const signIn = await client.auth.signInWithPassword({ email: founder.email,password: founder.password });
    const lower = signIn.data.session!.access_token;
    const factor = (await client.auth.mfa.listFactors()).data!.totp[0];
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id,code: totp(key) });
    const token = verified.data!.access_token;
    const started = await call("/api/v1/me/private-workflows",token,{ kind: "admin_workspace" },undefined,"POST");
    const workspace: string = started.data.id;
    expect(await call(admin,lower,undefined,workspace)).toMatchObject({ status: 401 });
    expect(await call(admin,token,undefined,randomUUID())).toMatchObject({ status: 403 });
    const view = await call(admin,token,undefined,workspace);
    expect(view.status).toBe(200);
    const data = view.data as VolunteerAdminView;
    expect(data.settings.categories).toHaveLength(15);
    const config = { ...receipt("configure",0), confirmed: true,reason,categories: ["education"],fields: ["experience"] };
    expect(await call(admin,token,{ ...config,enabled: true },workspace)).toMatchObject({ status: 400 });
    expect(await call(admin,token,config,workspace)).toMatchObject({ status: 200,data: { version: 1 } });
    expect(await call(admin,token,config,workspace)).toMatchObject({ status: 200,data: { version: 1 } });
    expect(await call(admin,token,{ ...config,requestId: randomUUID() },workspace)).toMatchObject({ status: 409 });
    const define = { ...receipt("define",0), confirmed: true,reason,code: "math_coaching",category: "education",
      names: { en: "Mathematics coaching",ht: "Antrenman matematik",fr: "Accompagnement en maths",es: "Acompañamiento matemático" },
      aliases: ["reading tutor"], descriptions: null,status: "draft" };
    expect(await call(admin,token,define,workspace)).toMatchObject({ status: 409 });
    expect(await call(admin,token,{ ...define,aliases: ["math tutor"] },workspace)).toMatchObject({ status: 200 });
    expect(await call(owner,signedIn.token)).toMatchObject({ data: { intake: false,profile: null,catalog: [] } });
    expect(sql("select not exists(select from private.c31_profiles) and not exists(select from private.c31_fixture);")).toBe("t");

    await inEnglish(context);
    await login(page,founder);
    await solveMfa(page,key);
    await page.goto("/admin?section=volunteerSettings");
    await page.getByRole("button",{ name: "Open administration",exact: true }).click();
    await expect(page.getByText("Configuration available",{ exact: false })).toBeVisible();
    await expect(page.getByRole("combobox",{ name: "Skills catalog" })).toBeVisible();
    await page.getByRole("button",{ name: "Switch to dark theme",exact: true }).click();
    await expect(page.getByRole("button",{ name: "Switch to light theme",exact: true })).toBeVisible();
    await expect(page.getByText("Configuration available",{ exact: false })).toBeVisible();
  } finally { sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`); }
});
