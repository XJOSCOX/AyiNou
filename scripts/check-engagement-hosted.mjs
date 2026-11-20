import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkEngagement({ author, reader, moderator, expected, send, query, createPost }) {
  const published = (await createPost({ body: "Synthetic discussion", language: "ht", visibility: "public" })).id;
  const members = (await createPost({ body: "Synthetic members discussion", language: "fr", visibility: "members_only" })).id;
  const comments = `/api/v1/posts/${published}/comments`;
  const privateComments = `/api/v1/posts/${members}/comments`;
  const input = { body: "  Synthetic source comment.  ", language: "ht" };
  const nonce = randomUUID();
  const create = (path, user, body = input, key = randomUUID()) =>
    expected(201, "POST", path, user, body, { "idempotency-key": key });

  const [first, retry] = await Promise.all([create(comments, author, input, nonce), create(comments, author, input, nonce)]);
  const root = first.id;
  assert.equal(retry.id, root);
  await expected(409, "POST", comments, author, { ...input, body: "Different source" }, { "idempotency-key": nonce });
  const reply = (await create(comments, reader, { body: "Réponse synthétique.", language: "fr", parentId: root })).id;
  const second = (await create(comments, reader, { body: "Segundo comentario sintético.", language: "es" })).id;
  await create(privateComments, author);
  await expected(404, "GET", privateComments);
  assert.equal((await expected(200, "GET", privateComments, reader)).comments.length, 1);
  for (const [url, data] of [[comments, { ...input, parentId: reply }], [privateComments, { ...input, parentId: root }]]) {
    await expected(400, "POST", url, author, data, { "idempotency-key": randomUUID() });
  }
  const page = await expected(200, "GET", `${comments}?limit=1`);
  assert.equal(page.comments[0].body, input.body);
  assert.equal(page.comments[0].hasReplies, true);
  assert.equal(page.comments[0].author?.avatarPath, undefined);
  assert.equal((await expected(200, "GET", `${comments}?cursor=${page.nextCursor}`)).comments[0].id, second);
  assert.equal((await expected(200, "GET", `${comments}?parent=${root}`)).comments[0].id, reply);

  const url = `/api/v1/comments/${root}`;
  await expected(403, "PATCH", url, reader, { ...input, version: 1 });
  await expected(403, "DELETE", `${url}?version=1`, reader);
  const edits = await Promise.all([
    send("PATCH", url, author, { ...input, body: "First update", version: 1 }),
    send("PATCH", url, author, { ...input, body: "Second update", version: 1 }),
  ]);
  assert.deepEqual(edits.map((response) => response.statusCode).sort(), [204, 409]);

  for (const reaction of [`/api/v1/posts/${published}/reaction`, `${url}/reaction`]) {
    await expected(401, "PUT", reaction, null, { kind: "like" });
    const put = (user, kind) => expected(200, "PUT", reaction, user, { kind });
    await Promise.all([put(reader, "like"), put(reader, "like"), put(reader, "like")]);
    await put(author, "celebrate");
    const changed = await put(reader, "support");
    assert.deepEqual(changed.reactions, { mine: "support", counts: { like: 0, love: 0, support: 1, celebrate: 1 } });
    const anonymous = await expected(200, "GET", reaction);
    assert.equal(anonymous.reactions.mine, null);
    assert.equal(anonymous.reactions.counts.celebrate, 1);
    const removed = await expected(200, "DELETE", reaction, reader);
    assert.equal(removed.reactions.mine, null);
    assert.equal(removed.reactions.counts.support, 0);
    assert.equal(removed.reactions.counts.celebrate, 1);
  }
  const postDetail = (await expected(200, "GET", `/api/v1/posts/${published}`, author)).post;
  assert.equal(postDetail.reactions.mine, "celebrate");

  const moderation = "/api/v1/moderation/feed?target=comments";
  await expected(204, "POST", `${url}/reports`, reader, { category: "privacy", note: "Synthetic private comment report." });
  assert.equal((await expected(409, "POST", `${url}/reports`, reader, { category: "spam" })).error.code, "DUPLICATE_REPORT");
  await expected(403, "GET", moderation, reader);
  const report = (await expected(200, "GET", moderation, moderator)).reports.find((item) => item.commentId === root);
  assert.equal(report?.note, "Synthetic private comment report.");
  assert.equal("reporterId" in report, false);
  const moderate = (action, version) => expected(204, "PATCH", `/api/v1/moderation/comments/${root}`, moderator,
    { action, version, reason: "Synthetic comment moderation rationale." });
  await moderate("hide", 2);
  const tombstone = (await expected(200, "GET", comments)).comments.find((item) => item.id === root);
  assert.equal(tombstone.available, false);
  assert.equal(tombstone.body, null);
  assert.equal(tombstone.author, null);
  await expected(404, "PUT", `${url}/reaction`, reader, { kind: "love" });
  await expected(403, "PATCH", url, author, { ...input, version: 3 });
  const audit = (await expected(200, "GET", `${moderation}&scope=hidden`, moderator)).reports.find((item) => item.commentId === root);
  assert.equal(audit.lastAction.action, "hide");
  await moderate("restore", 3);
  await moderate("remove", 4);
  await expected(204, "DELETE", `/api/v1/comments/${second}?version=1`, reader);
  assert.ok(!(await expected(200, "GET", comments)).comments.some((item) => item.id === second));
  await expected(204, "PATCH", `/api/v1/moderation/posts/${published}`, moderator,
    { action: "hide", version: 1, reason: "Synthetic discussion blocked by post moderation." });
  await expected(404, "GET", comments, author);
  await expected(404, "POST", comments, reader, input, { "idempotency-key": randomUUID() });
  await expected(404, "PUT", `/api/v1/comments/${reply}/reaction`, reader, { kind: "like" });
  await expected(204, "DELETE", `/api/v1/posts/${members}?version=1`, author);
  await expected(404, "GET", privateComments, reader);

  query(`insert into private.account_restrictions(user_id,status,reason)
    select id,'suspended','Synthetic engagement restriction test' from auth.users where id='${reader.id}' and email='${reader.email}';`);
  await expected(401, "POST", comments, reader, input, { "idempotency-key": randomUUID() });
  const denied = await reader.client.rpc("write_engagement_for_client", { p_operation: "post_reaction", p_id: published, p_kind: "like" });
  assert.equal(denied.error.code, "42501");
  console.log("Hosted comments, paging, concurrent retries, reactions, private reports, real TOTP decisions, and restricted targets passed.");
}
