import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // *.slow.test.ts files are excluded from the default suite — they take
    // tens of seconds and are run explicitly via `npm run test:slow`.
    // `.claude/**` is excluded so the agent scratch worktrees under
    // `.claude/worktrees/` (gitignored, may hold stale generated files like an
    // out-of-date ratings.ts) are never picked up by the test glob.
    exclude: ["e2e/**", "node_modules/**", "**/*.slow.test.ts", ".claude/**"],
  },
});
