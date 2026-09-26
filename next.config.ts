import type { NextConfig } from "next";
import { execSync } from "child_process";

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

const nextConfig: NextConfig = {
  // Lets a second build coexist with a running `next dev` instead of fighting it over `.next`.
  // The Shipwright perf sweep needs a PRODUCTION server (a dev server hot-reloads, and a Fast Refresh
  // remount destroys an in-flight benchmark run), but the dev server is usually up on 3001 at the same
  // time. `NEXT_DIST_DIR=.next-bench npm run build` gives that build its own output dir.
  // Unset — every normal build and deploy — this is exactly `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
