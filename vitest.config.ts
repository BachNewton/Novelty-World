import { defineConfig } from "vitest/config";
import path from "path";

// Other checkouts nested inside this one: agent worktrees under
// `.claude/worktrees/` and `.opencode/worktrees/`. To this checkout they don't
// exist: a worktree's tests run only from inside that worktree.
export const NESTED_CHECKOUTS = [".claude/**", ".opencode/worktrees/**"];

// Files every test depends on without importing: under `--changed`, a change to one runs every test. Absolute,
// since a glob's `**` skips the dot folders a worktree sits in.
const ROOT = __dirname.replaceAll("\\", "/");
export const FORCE_RERUN_TRIGGERS = [
  "package.json",
  "package-lock.json",
  "tsconfig*.json",
  "vitest.config.ts",
  "vitest.slow.config.ts",
].map((file) => `${ROOT}/${file}`);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // *.slow.test.ts files are excluded from the default suite — they take
    // tens of seconds and are run explicitly via `npm run test:slow`.
    exclude: ["e2e/**", "node_modules/**", "**/*.slow.test.ts", ...NESTED_CHECKOUTS],
    forceRerunTriggers: FORCE_RERUN_TRIGGERS,
    // A run's workers fill the cores (one less than there are), so each worker's layout solves get one thread.
    env: { FAMILY_TREE_SOLVER_THREADS: "1" },
    // `vitest bench` discovers files independently of `test.exclude`.
    benchmark: {
      exclude: ["node_modules/**", ...NESTED_CHECKOUTS],
    },
  },
});
