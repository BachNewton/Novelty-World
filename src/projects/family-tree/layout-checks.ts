import { describe } from "vitest";

// The layout checks (every test that lays a tree out, starting the solver's Python) are a tool for changes to
// layout/, not tests every run needs, so they are opt-in, and run alone on one worker, since a solve takes every core:
//   FAMILY_TREE_LAYOUT_CHECKS=1 npx vitest run --config vitest.slow.config.ts --maxWorkers=1 src/projects/family-tree
export const layoutChecks = describe.runIf(process.env.FAMILY_TREE_LAYOUT_CHECKS);
