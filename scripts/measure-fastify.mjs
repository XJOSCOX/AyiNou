import { performance } from "node:perf_hooks";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

// Synthetic adapters measure Fastify and route work independently of hosted latency.
const operations = { verify: 0, read: 0, rpc: 0 };
const config = readConfig({ LOG_LEVEL: "silent" });
const overrides = {
  auth: { async verify() { operations.verify++; return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; } },
  feed: {
    async read() { operations.read++; return []; },
    async rpc(_token, operation) {
      operations.rpc++;
      return operation === "notification_count_for_client" ? 0 : [];
    },
  },
};
const cases = {
  status: { url: "/api/v1/status" },
  publicFeed: { url: "/api/v1/feed" },
  following: { url: "/api/v1/feed?scope=following", headers: { authorization: "Bearer fixture" } },
  notifications: { url: "/api/v1/me/notifications/unread-count", headers: { authorization: "Bearer fixture" } },
  projectDirectory: { url: "/api/v1/projects" },
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
      for (const [name, request] of Object.entries(cases)) {
        const start = performance.now();
        const result = await app.inject({ ...request, remoteAddress: "127.0.0." + (index + 1) });
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
