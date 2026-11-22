import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ayinou/shared"],
  async headers() {
    const headers = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return ["/admin", "/verification/review", "/s/:path*"].map(source => ({ source, headers }));
  },
};

export default nextConfig;
