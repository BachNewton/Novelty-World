import type { NextConfig } from "next";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

// Vercel shallow-clones the repo and strips the `origin` remote, so a plain
// `git fetch --unshallow` has nothing to fetch from. Re-add origin from
// VERCEL_GIT_* env vars (public-repo HTTPS needs no auth), then unshallow.
function unshallow(): void {
  try {
    const isShallow = execSync("git rev-parse --is-shallow-repository").toString().trim();
    if (isShallow !== "true") return;
    const owner = process.env.VERCEL_GIT_REPO_OWNER;
    const slug = process.env.VERCEL_GIT_REPO_SLUG;
    if (owner && slug) {
      const url = `https://github.com/${owner}/${slug}.git`;
      execSync(`git remote add origin ${url} || git remote set-url origin ${url}`, { stdio: "ignore", shell: "/bin/sh" });
    }
    execSync("git fetch --unshallow origin", { stdio: "ignore" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[next.config] unshallow failed: ${msg.replace(/\n/g, " | ")}`);
  }
}
unshallow();
const commitCount = execSync("git rev-list --count HEAD").toString().trim();

// Turbopack compiles nothing outside its root, which defaults to the nearest lockfile's folder. An agent
// worktree under `.claude/worktrees/` has its own lockfile but no `node_modules`: it resolves the main
// checkout's install upward, so its root must be the folder that holds that install. Everywhere else
// (the main checkout, Vercel) that folder is the repo root, the default.
function installRoot(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this file's own folder and its ancestors, never outside input
    if (existsSync(path.join(dir, "node_modules", "next", "package.json"))) return dir;
    if (path.dirname(dir) === dir) return __dirname;
  }
}

const nextConfig: NextConfig = {
  turbopack: { root: installRoot() },
  // Lets a second build coexist with a running `next dev` instead of fighting it over `.next`.
  // The Shipwright perf sweep needs a PRODUCTION server (a dev server hot-reloads, and a Fast Refresh
  // remount destroys an in-flight benchmark run), but the dev server is usually up on 3001 at the same
  // time. `NEXT_DIST_DIR=.next-bench npm run build` gives that build its own output dir.
  // Unset — every normal build and deploy — this is exactly `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // An e2e run's own build (e2e/next-server.ts) points Next at that run's tsconfig, so the build's
  // per-run `include` additions land there and never in the tracked tsconfig.json. It skips the type
  // check: `npm run typecheck` owns that, and an e2e run shouldn't fail on a type error in someone's
  // unrelated half-done work.
  ...(process.env.E2E_TSCONFIG === undefined
    ? {}
    : { typescript: { tsconfigPath: process.env.E2E_TSCONFIG, ignoreBuildErrors: true } }),
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
