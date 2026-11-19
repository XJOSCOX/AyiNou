import "dotenv/config";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = createApp(config);

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  process.exitCode = 1;
}
