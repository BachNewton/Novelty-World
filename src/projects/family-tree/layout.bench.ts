// Benches for computeLayout. Two groups:
//   - productionTree: live snapshot of the real family_tree row. The
//     authoritative real-world number to track for regressions.
//   - synthetic sweep: parameterized shapes that vary L (chain depth),
//     pedigree depth, sibling-fan width K, and recursive branching. Used
//     to validate the complexity story.
//
// Note: the synthetic sweeps systematically *underestimate* real cost
// because none of them produce the "two adjacent wide layers densely
// interconnected" pattern that triggers the worst case. They validate
// the W-dominates trend; productionTree is what tells you the absolute
// number.
//
// Run with `npm run bench`.

import { bench, describe } from "vitest";
import { computeLayout } from "./layout/compute-layout";
import {
  ancestorPedigree,
  branching,
  chain,
  kitchenSink,
  productionTree,
  siblingFanOfWidth,
} from "./__fixtures__/trees";

describe("productionTree (real family_tree row)", () => {
  const tree = productionTree();
  // Single iteration: the exact decross dominates the cost, and with
  // `progress` the solver prints its own time next to the bench's total.
  // Re-run a few times if a change looks marginal and you need to defeat
  // run-to-run variance.
  bench(
    "computeLayout",
    () => {
      computeLayout(tree, { progress: true });
    },
    { time: 0, iterations: 1 },
  );
});

describe("kitchenSink (synthetic ~50 ppl, narrower than production)", () => {
  const tree = kitchenSink();
  bench("computeLayout", () => {
    computeLayout(tree);
  });
});

// Sweep L holding W=1: should be ~flat; isolates pre/post-process cost.
describe("chain — depth sweep (W=1)", () => {
  for (const L of [5, 20, 50]) {
    const tree = chain(L);
    bench(`L=${L} (N=${L})`, () => {
      computeLayout(tree);
    });
  }
});

// Sweep pedigree depth: every step doubles W. depth=6 has 32 grandparent
// couples in the deepest layer — this is where the exact decross starts to feel it.
describe("ancestorPedigree — width sweep", () => {
  for (const depth of [3, 4, 5, 6]) {
    const tree = ancestorPedigree(depth);
    const N = (1 << depth) - 1;
    const W = depth >= 2 ? 1 << (depth - 2) : 1;
    bench(`depth=${depth} (N=${N}, W=${W})`, () => {
      computeLayout(tree);
    });
  }
});

// Sweep sibling-fan width K: 1 + K layer-1 couples under a single layer-0
// couple. The decross has nothing to permute against, so this should stay
// cheap even at large W.
describe("siblingFan — width sweep (single parent couple)", () => {
  for (const K of [5, 15, 30]) {
    const tree = siblingFanOfWidth(K);
    const N = Object.keys(tree.persons).length;
    bench(`K=${K} (N=${N})`, () => {
      computeLayout(tree);
    });
  }
});

// Recursive branching grows W and L jointly; person count = b^d. Keep
// (b, d) modest to avoid >100k-person trees in the bench.
describe("branching — joint W/L sweep", () => {
  for (const [b, d] of [
    [2, 3],
    [2, 4],
    [3, 3],
    [3, 4],
  ] as const) {
    const tree = branching(b, d);
    const N = Object.keys(tree.persons).length;
    bench(`b=${b}, d=${d} (N=${N})`, () => {
      computeLayout(tree);
    });
  }
});
