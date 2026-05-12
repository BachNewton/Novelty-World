// Phase breakdown bench: confirms HiGHS IP is still the dominant cost.
//
// Monkey-patches `highs.solve` to record cumulative MIP-solve wallclock,
// then compares that against total `computeLayout` time on the production
// tree (refresh via the psql one-liner in trees.ts's productionTree() doc
// comment).
//
// Per-iteration timings go to console.log because vitest's `bench()`
// reports only aggregate ops/sec. iterations:3 keeps the run bounded and
// gives enough samples to spot run-to-run variance.
//
// Run with `npm run bench`.

import { bench, describe } from "vitest";
import { loadHighs } from "./decross-highs";
import { computeLayout } from "./logic";
import { productionTree } from "./__fixtures__/trees";

const highs = await loadHighs();
const originalSolve = highs.solve.bind(highs);

let highsSolveMs = 0;
highs.solve = ((...args: Parameters<typeof originalSolve>) => {
  const t0 = performance.now();
  const result = originalSolve(...args);
  highsSolveMs += performance.now() - t0;
  return result;
}) as typeof highs.solve;

describe("productionTree — phase breakdown", () => {
  const tree = productionTree();

  bench(
    "computeLayout vs highs.solve",
    async () => {
      highsSolveMs = 0;
      const t0 = performance.now();
      await computeLayout(tree, { decross: "opt" });
      const totalMs = performance.now() - t0;
      const restMs = totalMs - highsSolveMs;
      const pct = (highsSolveMs / totalMs) * 100;
      console.log(
        `  total=${totalMs.toFixed(0)}ms  highs.solve=${highsSolveMs.toFixed(0)}ms (${pct.toFixed(1)}%)  rest=${restMs.toFixed(0)}ms`,
      );
    },
    { time: 0, iterations: 3 },
  );
});
