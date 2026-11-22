import { createClient } from "@supabase/supabase-js";
import { feedMessages } from "../src/lib/feed-i18n";
import { messages } from "../src/lib/i18n";
import { trustMessages } from "../src/lib/trust-i18n";
import { apiCall, expect, sql, test, totp, type Member } from "./fixtures";

async function withRecentMfa(member: Member): Promise<Member> {
  const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const enrollment = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollment.error) throw enrollment.error;
  const { id, totp: { secret } } = enrollment.data;
  const confirmation = await client.auth.mfa.challengeAndVerify({ factorId: id, code: totp(secret) });
  if (confirmation.error) throw confirmation.error;
  return { ...member, token: confirmation.data.access_token };
}

test("Founder release checks routine and restricted capabilities across five roles @smoke", async ({ makeMember }) => {
  test.setTimeout(90_000);
  const people = await Promise.all(Array.from({ length: 5 }, () => makeMember()));
  const [founder, administrator, moderator, reviewer, member] = await Promise.all(people.map(withRecentMfa));
  const roles = [
    { actor: founder, routine: true, moderate: true, review: false },
    { actor: administrator, routine: true, moderate: true, review: false },
    { actor: moderator, routine: false, moderate: true, review: false },
    { actor: reviewer, routine: false, moderate: false, review: true },
    { actor: member, routine: false, moderate: false, review: false },
  ];
  sql(`begin;
    insert into private.platform_bootstrap(user_id) values ('${founder.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values ('${founder.id}','first_account_bootstrapped','Disposable verified founding provenance');
    insert into public.role_assignments(user_id,role) values
      ('${administrator.id}','administrator'),('${moderator.id}','moderator');
    insert into private.verification_reviewers(user_id) values ('${reviewer.id}');
    commit;`);

  try {
    const evidence = "https://example.org/founder-audit-fixture";
    const { id: application } = await apiCall(member, "/api/v1/me/verification", 201, "POST", {
      organizationId: null, kind: "identity", evidence: [evidence],
    });
    const project = `jsonb_populate_record(null::private.community_projects,jsonb_build_object('creator_id','${member.id}'))`;
    for (const { actor, routine, moderate, review } of roles) {
      const endpoints = ["overview", "accounts", "audit", "safety", "ambassadors", "legal", "legal/audit", "organization-onboarding/corrections"];
      await Promise.all(endpoints.map((endpoint) => apiCall(actor, "/api/v1/admin/" + endpoint, routine ? 200 : 403)));
      await apiCall(actor, "/api/v1/moderation/feed", moderate ? 200 : 403);
      expect(sql(`select private.project_reviewer(${project},'${actor.id}');`)).toBe(moderate ? "t" : "f");
      const queue = await apiCall(actor, "/api/v1/verification/review", review ? 200 : 403);
      if (review) expect(queue.applications).toContainEqual(expect.objectContaining({ id: application, evidence: [], assignedToMe: false }));
      await apiCall(actor, "/api/v1/admin/founder-identity", 403);
      await apiCall(actor, "/api/v1/admin/early-partners", 403);
      await apiCall(actor, "/api/v1/admin/privacy-requests/queue", 403);
      const governance = await apiCall(actor, "/api/v1/admin/governance", routine ? 200 : 403);
      if (routine) {
        expect(governance).toMatchObject({ executionEnabled: false, recoveryEnabled: false });
        expect(governance.administrators.filter(({ id }: { id: string }) => id === founder.id))
          .toEqual([expect.objectContaining({ id: founder.id, founding: true, eligible: true })]);
        expect(governance.administrators).toContainEqual(expect.objectContaining({
          id: administrator.id, founding: false, eligible: true,
        }));
      }
    }
    await apiCall(people[0], "/api/v1/admin/accounts", 401);
    await apiCall(reviewer, "/api/v1/verification/review/" + application + "/work", 204, "PATCH", { claim: true });
    expect((await apiCall(reviewer, "/api/v1/verification/review", 200)).applications)
      .toContainEqual(expect.objectContaining({ id: application, evidence: [evidence], assignedToMe: true }));
    expect((await apiCall(founder, "/api/v1/admin/accounts?q=" + member.handle, 200)).accounts)
      .toContainEqual(expect.objectContaining({ id: member.id, personalClaims: [] }));
    for (const actor of [founder, administrator]) {
      const dependencies = JSON.parse(sql(`select private.lifecycle_inventory('${actor.id}')->'dependencies';`));
      expect(dependencies).toContainEqual(expect.objectContaining({ kind: "privileged_role", disposition: "block" }));
      expect(dependencies).not.toContainEqual(expect.objectContaining({ kind: "last_administrator" }));
    }
    expect(sql(`select
      has_table_privilege('authenticated','private.poll_ballots','select')
      or has_function_privilege('authenticated','private.platform_admin_roster()','execute')
      or has_function_privilege('service_role','private.platform_admin_roster()','execute')
      or not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
        where p.oid='private.platform_admin_roster()'::regprocedure and r.rolname='postgres')
      or exists(select 1 from pg_trigger where tgname='close_identity_application_on_founder_grant' and not tgisinternal);`)).toBe("f");
    expect(sql("select private.founder_identity_policy_open();")).toBe("f");
  } finally {
    sql(`begin;
      delete from private.platform_bootstrap where user_id='${founder.id}';
      delete from public.role_assignments where user_id in ('${administrator.id}','${moderator.id}');
      delete from private.verification_reviewers where user_id='${reviewer.id}';
      commit;`);
  }
});

test("feed and discussion render the specific reviewed claim with the blue badge", async ({ page, signedIn, makeMember }) => {
  const author = await makeMember({ visible: true });
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${author.id}','notable_person','verified','review','${signedIn.id}',now());`);
  const body = "Founder audit fixture for claim display";
  const post = await apiCall(author, "/api/v1/posts", 201, "POST", { body, visibility: "public", language: "en" });
  await apiCall(author, "/api/v1/posts/" + post.id + "/comments", 201, "POST", {
    body: "Founder audit comment with the same claim", language: "en",
  });

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/feed");
  const article = page.getByRole("article").filter({ hasText: body });
  const badge = article.getByRole("img", { name: trustMessages.en.notable_person, exact: true });
  await expect(badge.locator("img").first()).toHaveAttribute("src", "/verified.png");
  await expect(article.getByRole("img", { name: trustMessages.en.identity, exact: true })).toHaveCount(0);
  await expect(article.locator('img[src="/verified-badge.png"]')).toHaveCount(0);

  await page.getByRole("button", { name: messages.en.switchToDark }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const discussion = article.getByRole("button", { name: feedMessages.en.comments, exact: true });
  await discussion.focus();
  await discussion.press("Enter");
  await expect(badge).toHaveCount(2);
  await expect(badge.last().locator("img")).toHaveAttribute("src", "/verified.png");
  await expect(article.getByText("Founder audit comment with the same claim", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
