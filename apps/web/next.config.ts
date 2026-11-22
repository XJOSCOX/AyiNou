import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ayinou/shared"],
  async headers() {
    return [{
      source: "/s/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }];
  },
};

export default nextConfig;
