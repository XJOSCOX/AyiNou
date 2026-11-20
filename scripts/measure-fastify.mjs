import { performance } from "node:perf_hooks";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

// Synthetic adapters measure Fastify and route work independently of hosted latency.
const operations = { verify: 0, read: 0, rpc: 0, recommendations: 0 };
const config = readConfig({ LOG_LEVEL: "silent" });
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const overrides = {
  auth: { async verify(token) { operations.verify++; return "aaaaaaaa-aaaa-4aaa-8aaa-" + token.padStart(12, "0"); } },
  feed: {
    async read() { operations.read++; return []; },
    async recommendations() {
      operations.recommendations++;
      return { snapshotId: id, algorithmVersion: "synthetic", rows: [] };
    },
    async rpc(_token, operation) {
      operations.rpc++;
      const responses = {
        notification_count_for_client: 0,
        read_community_recommendations_for_client: { snapshotId: id, algorithmVersion: "synthetic", rows: [] },
        poll_detail_for_client: { ownBallot: null },
        poll_vote_for_client: { optionId: id },
        project_work_for_client: { projectId: id },
      };
      return responses[operation] ?? [];
    },
  },
};
const cases = {
  status: { url: "/api/v1/status" },
  publicFeed: { url: "/api/v1/feed" },
  following: { url: "/api/v1/feed?scope=following", member: true },
  forYou: { url: "/api/v1/feed?scope=for_you", member: true },
  communities: { url: "/api/v1/communities/recommendations/list", member: true },
  discoverPeople: { url: "/api/v1/discover/people", member: true },
  discoverInstitutions: { url: "/api/v1/discover/institutions", member: true },
  notifications: { url: "/api/v1/me/notifications/unread-count", member: true },
  projectDirectory: { url: "/api/v1/projects" },
  projectWork: { url: "/api/v1/projects/" + id + "/work", member: true },
  pollDirectory: { url: "/api/v1/polls", member: true },
  pollDetail: { url: "/api/v1/polls/" + id, member: true },
  pollVote: { method: "POST", url: "/api/v1/polls/" + id + "/ballot", payload: { optionId: id }, member: true },
};
const statistics = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)) };
};
const create = [];
const register = [];
const listen = [];
const memory = [];
const latency = Object.fromEntries(Object.keys(cases).map((name) => [name, []]));
for (let sample = 0; sample < 13; sample++) {
  const now = performance.now();
  const app = createApp(config, overrides);
  const created = performance.now();
  let afterReady;
  try {
    await app.ready();
    afterReady = performance.now();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const listening = performance.now();
    const response = await fetch(address + "/api/v1/status", { signal: AbortSignal.timeout(5_000) });
    if (!response.ok || (await response.json()).status !== "ok") throw new Error("Fastify startup failed");
    if (sample >= 2) {
      create.push(created - now);
      register.push(afterReady - created);
      listen.push(listening - afterReady);
    }
    for (let index = 0; index < 60; index++) {
      for (const [name, { member, ...request }] of Object.entries(cases)) {
        const start = performance.now();
        const result = await app.inject({ ...request, remoteAddress: "127.0.0." + (index + 1),
          headers: member ? { authorization: "Bearer " + index } : undefined });
        const duration = performance.now() - start;
        if (result.statusCode !== 200) throw new Error(`${name} failed with ${result.statusCode}`);
        if (sample >= 2 && index >= 10) latency[name].push(duration);
      }
    }
  } finally {
    await app.close();
  }
  globalThis.gc?.();
  if (sample >= 2) memory.push(process.memoryUsage().heapUsed / (1024 * 1024));
}
console.log(JSON.stringify({
  createMs: statistics(create), registerMs: statistics(register), listenMs: statistics(listen),
  injectMs: Object.fromEntries(Object.entries(latency).map(([name, values]) => [name, statistics(values)])),
  postCloseHeapMiB: statistics(memory), operationCountsIncludingWarmup: operations,
}, null, 2));
