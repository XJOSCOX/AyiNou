import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, localClient, sql, test } from "./fixtures";

test("P1 native poll scope and private ballot grants hold in PostgreSQL", () => {
  const assertions = readFileSync(join(__dirname, "../../../supabase/tests/polls_rollback.sql"), "utf8");
  expect(sql(`begin;\n${assertions}\nrollback;`)).toContain("ROLLBACK");
});

test("P1 post-media accepts only a current lease from an active account and permits cleanup", async ({ signedIn }) => {
  const service = localClient("AYINOU_E2E_SUPABASE_SECRET");
  const reserve = async () => {
    const id = randomUUID(), lease = randomUUID();
    const result = await service.rpc("reserve_post_upload_for_api", {
      p_actor: signedIn.id, p_id: id, p_lease: lease, p_digest: "00".repeat(32),
      p_width: 20, p_height: 20, p_thumb: 40, p_display: 40,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    return { id, lease };
  };
  const finish = ({ id, lease }: { id: string; lease: string }, ready: boolean) =>
    service.rpc("finish_post_upload_for_api", { p_id: id, p_lease: lease, p_ready: ready });

  const [current, expired, pending] = [await reserve(), await reserve(), await reserve()];
  expect(await finish(current, true)).toMatchObject({ data: true, error: null });
  sql(`update feed_data.post_attachments set upload_until=clock_timestamp()-interval '1 second' where id='${expired.id}';`);
  expect(await finish(expired, true)).toMatchObject({ data: false, error: null });
  expect(await finish(expired, false)).toMatchObject({ data: true, error: null });

  sql(`insert into private.m23_restrictions(subject_id,capability,scope_kind,authority,max_minutes,category,starts_at,expires_at)
    values('${signedIn.id}','media','platform','founder',60,'safety',now(),now()+interval '1 hour');`);
  const restricted = await finish(pending, true);
  expect(restricted.error?.code).toBe("M2301");
  expect(await finish(pending, false)).toMatchObject({ data: true, error: null });
  sql(`update private.m23_restrictions set revoked_at=clock_timestamp()
    where subject_id='${signedIn.id}' and capability='media';`);

  const suspended = await reserve();
  sql(`insert into private.m22_account_sanctions(subject_id,kind,category,started_at,expires_at)
    values('${signedIn.id}','suspended','safety',now(),now()+interval '1 hour');`);
  expect(await finish(suspended, true)).toMatchObject({ data: false, error: null });
  expect(await finish(suspended, false)).toMatchObject({ data: true, error: null });
  expect(sql(`select count(*) from feed_data.post_attachments where id in
    ('${expired.id}','${pending.id}','${suspended.id}') and state='uploading' and lease is null;`)).toBe("3");
  expect(sql("select not has_function_privilege('authenticated','public.finish_post_upload_for_api(uuid,uuid,boolean)','execute');")).toBe("t");
});
