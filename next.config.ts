import type { NextConfig } from "next";
import { execSync } from "child_process";

// CI hosts (Vercel etc.) shallow-clone by default, which truncates the
// commit count. Diagnose what state the .git is in and try to unshallow.
function logCmd(label: string, cmd: string): void {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
    console.log(`[next.config] ${label}: ${out || "(empty)"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[next.config] ${label} FAILED: ${msg.replace(/\n/g, " | ")}`);
  }
}
logCmd("is-shallow", "git rev-parse --is-shallow-repository");
logCmd("remote-v", "git remote -v");
logCmd("fetch-unshallow", "git fetch --unshallow 2>&1");
logCmd("count-after", "git rev-list --count HEAD");
const commitCount = execSync("git rev-list --count HEAD").toString().trim();

// `highs` (HiGHS WASM solver, used by family-tree's decross-highs.ts) ships a
// universal CJS bundle whose Node branch does `require("fs")`/`require("path")`
// and uses `__dirname`. Behavior we want:
//   - Server (SSR / Node test): use real Node — keep `highs` external so the
//     bundler doesn't trace into it. Node has real fs/path.
//   - Client / Web Worker: bundler traces highs but `m` (the Node detection
//     flag inside highs.js) is false at runtime, so fs/path are never called.
//     We still need the static IDs to resolve, so we alias them to an empty
//     stub. Use a project-relative path with `./` prefix — Turbopack rejects
//     absolute paths cross-platform (Linux `/vercel/path0/...` reads as
//     "server relative", which it doesn't support).
const emptyStub = "./src/shared/lib/empty-module.ts";

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
  serverExternalPackages: ["highs"],
  turbopack: {
    resolveAlias: {
      fs: { browser: emptyStub },
      path: { browser: emptyStub },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
