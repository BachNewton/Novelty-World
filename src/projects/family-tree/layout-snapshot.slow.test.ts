// Pixel-exact snapshot of computeLayout against productionTree, a quality
// tripwire, among the opt-in layout checks.

import { it, expect } from "vitest";
import { layoutChecks } from "./layout-checks";
import { computeLayout } from "./layout/compute-layout";
import { productionTree } from "./__fixtures__/trees";
import { serializeLayout } from "./layout-snapshot.helpers";

layoutChecks("productionTree layout — fancy", () => {
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
