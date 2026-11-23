import { isIP } from "node:net";

export function webListener(environment) {
  const host = environment.WEB_HOST ?? "127.0.0.1";
  const port = environment.WEB_PORT ?? "4000";
  if (!isIP(host) && !/^[a-z0-9][a-z0-9.-]*$/i.test(host)) {
    throw new Error("WEB_HOST must be a hostname or IP address.");
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error("WEB_PORT must be an integer from 1 to 65535.");
  }
  return { host, port: Number(port) };
}

const hostedOrigins = ["WEB_ORIGIN", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SUPABASE_URL"];

export function assertHostedOrigins(environment) {
  const invalid = hostedOrigins.filter((key) => {
    const value = environment[key];
    const url = value && URL.canParse(value) ? new URL(value) : null;
    if (!url || !/^https:\/\/[^/?#\\\s]+$/i.test(value) || url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) return true;

    const host = url.hostname.replace(/\.$/, "");
    return host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" ||
      (isIP(host) === 4 && host.startsWith("127.")) || /^\[::(?:|1|ffff:(?:7f[0-9a-f]{2}|0):[0-9a-f]+)\]$/.test(host);
  });
  if (invalid.length) {
    throw new Error("Hosted web builds require explicit non-loopback HTTPS origins in " + invalid.join(", ") +
      ". Use npm run build:local for a local build.");
  }
}
