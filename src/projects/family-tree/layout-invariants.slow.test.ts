// Same invariants as layout-invariants.test.ts, applied to the fixtures
// large enough that the exact solves take seconds. Run with `npm run test:slow`.
//
// familyNetwork is near the live tree's size and shape, so a solve that
// scales badly (or stops being deterministic) fails here rather than on the
// next write to the live tree.

import { describe } from "vitest";
import { familyNetwork, productionTree } from "./__fixtures__/trees";
import { defineLayoutInvariants } from "./layout-invariants.test";

describe("computeLayout invariants — productionTree", () => {
  defineLayoutInvariants("productionTree", productionTree);
});

describe("computeLayout invariants — familyNetwork", () => {
  defineLayoutInvariants("familyNetwork", () => familyNetwork());
});
