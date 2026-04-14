import type { NextConfig } from "next";
import { execSync } from "child_process";

const commitCount = execSync("git rev-list --count HEAD").toString().trim();

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: commitCount,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "halo.wiki.gallery" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
