// Pixel-exact snapshot of computeLayout against productionTree, a quality
// tripwire. Its exact solve takes every core, so it is opt-in (FULL_SOLVES).

import { describe, it, expect } from "vitest";
import { computeLayout } from "./layout/compute-layout";
import { FULL_SOLVES, productionTree } from "./__fixtures__/trees";
import { serializeLayout } from "./layout-snapshot.helpers";

describe.runIf(FULL_SOLVES)("productionTree layout — fancy", () => {
  it(
    "matches the pinned snapshot",
    { timeout: 180_000 },
    async () => {
      const layout = computeLayout(productionTree());
      await expect(serializeLayout(layout)).toMatchFileSnapshot(
        "./__snapshots__/production-tree.fancy.json",
      );
    },
  );
});
