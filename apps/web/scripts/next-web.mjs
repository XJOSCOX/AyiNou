import nextEnv from "@next/env";
import { webListener } from "../web-environment.mjs";

const [mode, ...args] = process.argv.slice(2);
if (mode === "build-local") {
  process.env.AYINOU_LOCAL_WEB_BUILD = "1";
  process.argv.splice(2, Infinity, "build", "--webpack", ...args);
} else {
  if (mode !== "dev" && mode !== "start") throw new Error("Use dev, start, or build-local.");
  nextEnv.loadEnvConfig(process.cwd(), mode === "dev");
  const { host, port } = webListener(process.env);
  process.argv.splice(2, Infinity, mode, "--hostname", host, "--port", String(port), ...args);
}
await import("next/dist/bin/next");
