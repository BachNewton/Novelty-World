import { defineConfig } from "vitest/config";
import path from "path";

// Other checkouts nested inside this one: agent worktrees under
// `.claude/worktrees/` and `.opencode/worktrees/`. To this checkout they don't
// exist: a worktree's tests run only from inside that worktree.
export const NESTED_CHECKOUTS = [".claude/**", ".opencode/worktrees/**"];

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
    // `vitest bench` discovers files independently of `test.exclude`.
    benchmark: {
      exclude: ["node_modules/**", ...NESTED_CHECKOUTS],
    },
  },
});
