// Config for `npm run test:slow`. Discovers only *.slow.test.ts files,
// which the default config (vitest.config.ts) explicitly excludes. These
// tests take tens of seconds and are run on demand, not in the regular
// suite.
import { defineConfig } from "vitest/config";
import path from "path";
import { NESTED_CHECKOUTS } from "./vitest.config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["**/*.slow.test.ts"],
    // Every file here is CPU-bound for seconds at a time, and several hold per-test limits: half the
    // logical cores (about one file per physical core) gives each test the CPU its limit was set for.
    // The longest file, the simulation's seeds, sets the suite's length either way.
    maxWorkers: "50%",
    exclude: ["e2e/**", "node_modules/**", ...NESTED_CHECKOUTS],
  },
});
