// Pixel-exact snapshot of computeLayout against productionTree. The exact
// solve takes seconds, too long for the default suite, so it is kept here as
// a quality tripwire. Run with `npm run test:slow`.

import { describe, it, expect } from "vitest";
import { computeLayout } from "./layout/compute-layout";
import { productionTree } from "./__fixtures__/trees";
import { serializeLayout } from "./layout-snapshot.helpers";

describe("productionTree layout — fancy", () => {
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
