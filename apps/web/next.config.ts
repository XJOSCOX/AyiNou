import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { assertHostedOrigins } from "./web-environment.mjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@ayinou/shared"],
  async headers() {
    const headers = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return ["/admin", "/verification/review", "/s/:path*", "/settings/volunteering/:path*", "/institutions/:id/opportunities/:path*", "/communities/intake/needs/:path*", "/communities/intake/triage", "/communities/intake/links", "/communities/:slug"].map(source => ({ source, headers }));
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.AYINOU_LOCAL_WEB_BUILD !== "1") {
    assertHostedOrigins(process.env);
  }
  return nextConfig;
}
