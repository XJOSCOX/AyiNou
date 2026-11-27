import "dotenv/config";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = createApp(config);

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  if (config.renderDevelopment) {
    const close = () => {
      void app.close().catch(() => {
        app.log.error("API shutdown failed");
        process.exitCode = 1;
      });
    };
    process.once("SIGTERM", close);
    process.once("SIGINT", close);
  }
} catch (error) {
  app.log.error({ kind: error instanceof Error ? error.name : "unknown" }, "API startup failed");
  process.exitCode = 1;
}
