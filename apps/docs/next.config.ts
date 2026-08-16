import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@creed/app", "@creed/ui"],
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      "/home",
      "/pricing",
      "/roadmap",
      "/bench",
      "/changelog",
      "/privacy",
      "/terms",
      "/stack",
      "/connections",
      "/file",
    ].map((source) => ({
      source,
      destination: `https://creed.md${source}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
