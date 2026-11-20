import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createPostMediaService } from "../src/services/post-media.js";
import { supabaseFetch } from "../src/services/supabase-transport.js";

const config = readConfig({
  LOG_LEVEL: "silent",
  SUPABASE_URL: "http://127.0.0.1:19",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SECRET_KEY: "test-service",
});
const actor = randomUUID();
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const header = part({ alg: "HS256", typ: "JWT" });
const claims = { sub: actor, session_id: randomUUID(), iss: config.SUPABASE_URL + "/auth/v1",
  aud: "authenticated", role: "authenticated", aal: "aal1", exp: Math.floor(Date.now() / 1000) + 60 };
const token = (payload: typeof claims) => [header, part(payload), "c3ludGhldGlj"].join(".");
const responseError = (status: number, code: string) =>
  Response.json({ code, message: "Synthetic upstream detail" }, { status });

test("upstream deadline preserves caller cancellation and remains active after response headers", async ({ mock }) => {
  mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    assert(signal);
    signal.throwIfAborted();
    const body = new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    return new Response(body);
  });
  const fetchWithDeadline = supabaseFetch(30);
  const keepAlive = setTimeout(40);
  const timed = await fetchWithDeadline(config.SUPABASE_URL!);
  await assert.rejects(timed.text(), { name: "TimeoutError" });
  await keepAlive;

  const cancelled = new AbortController();
  const request = new Request(config.SUPABASE_URL!, { signal: cancelled.signal });
  const pending = await supabaseFetch()(request);
  cancelled.abort();
  await assert.rejects(pending.text(), { name: "AbortError" });
});

test("Auth and quota outages fail closed and ambiguous poll writes are never replayed", async ({ mock }) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  mock.method(AbortSignal, "timeout", () => timeout(35));
  let mode = "";
  let calls: string[] = [];
  const choice = randomUUID();
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const operation = new URL(input.toString()).pathname.split("/").at(-1)!;
    calls.push(operation);
    if (operation === mode) {
      await setTimeout(200, undefined, { signal: init?.signal ?? undefined });
      throw new Error("Deadline failed");
    }
    if (operation === "user") return Response.json({ id: actor, aud: "authenticated" });
    if (operation === "account_session_for_api") return Response.json(mode !== "revoked");
    if (operation === "consume_safety_read_for_api") return mode === "quota-failure" ? responseError(503, "unavailable") : Response.json(true);
    if (operation === "poll_detail_for_client") return mode === "db-cancel" ? responseError(500, "57014") : Response.json({ ownBallot: choice, results: null });
    throw new Error("Unexpected synthetic upstream operation");
  });
  const app = createApp(config);
  const url = "/api/v1/polls/" + randomUUID();
  const headers = { authorization: "Bearer " + token(claims) };
  const assertUnavailable = (response: Awaited<ReturnType<typeof app.inject>>) => {
    assert.equal(response.statusCode, 503);
    const { error } = response.json();
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    assert.equal(error.retryable, true);
    assert.equal(error.requestId, response.headers["x-request-id"]);
    assert.match(error.requestId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(response.body, /Synthetic upstream detail|test-service|127\.0\.0\.1/);
  };

  try {
    for (const unavailable of ["user", "account_session_for_api", "quota-failure", "db-cancel"]) {
      mode = unavailable;
      calls = [];
      assertUnavailable(await app.inject({ url, headers }));
      if (mode !== "db-cancel") assert.ok(!calls.includes("poll_detail_for_client"));
    }
    for (const invalid of ["revoked", "expired"]) {
      mode = invalid;
      calls = [];
      const auth = invalid === "expired" ? "Bearer " + token({ ...claims, exp: 1 }) : headers.authorization;
      assert.equal((await app.inject({ url, headers: { authorization: auth } })).statusCode, 401);
      assert.ok(!calls.includes("poll_detail_for_client"));
    }
    mode = "poll_vote_for_client";
    calls = [];
    assertUnavailable(await app.inject({ method: "POST", url: url + "/ballot", headers, payload: { optionId: choice } }));
    assert.equal(calls.filter((name) => name === "poll_vote_for_client").length, 1);
    mode = "";
    assert.deepEqual((await app.inject({ url: url + "/ballot", headers })).json(), { optionId: choice });
  } finally {
    await app.close();
  }
});

test("interrupted media upload releases its lease and unavailable private delivery is bounded", async ({ mock }) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  mock.method(AbortSignal, "timeout", () => timeout(35));
  let uploads = 0;
  const finished: boolean[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input.toString()).pathname;
    if (path.endsWith("/reserve_post_upload_for_api")) return Response.json(true);
    if (path.endsWith("/finish_post_upload_for_api")) {
      finished.push(JSON.parse(init?.body as string).p_ready);
      return Response.json(true);
    }
    if (path.includes("/storage/v1/object/")) {
      if (init?.method === "POST" || init?.method === "PUT") uploads++;
      await setTimeout(200, undefined, { signal: init?.signal ?? undefined });
      throw new Error("Deadline failed");
    }
    throw new Error("Unexpected storage operation");
  });
  const media = createPostMediaService(config)!;
  const photo = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#7594ae" } }).png().toBuffer();
  await assert.rejects(media.upload(actor, randomUUID(), photo), { code: "STORAGE_UNAVAILABLE" });
  assert.equal(uploads, 1);
  assert.deepEqual(finished, [false]);
  await assert.rejects(media.download(randomUUID(), "thumbnail"), { code: "STORAGE_UNAVAILABLE" });
});
