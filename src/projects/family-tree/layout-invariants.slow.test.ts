// Same invariants as layout-invariants.test.ts, applied to the fixtures
// large enough that the exact solves take seconds. Run with `npm run test:slow`.
//
// productionWithOverflow adds partners past a card's two sides to the
// production tree, so the bracket checks run at production size.
//
// familyNetwork is near the live tree's size and shape, so a solve that
// scales badly (or stops being deterministic) fails here rather than on the
// next write to the live tree.

import { describe } from "vitest";
import { familyNetwork, productionTree, productionWithOverflow } from "./__fixtures__/trees";
import { defineLayoutInvariants } from "./layout-invariants.test";

describe("computeLayout invariants — productionTree", () => {
  defineLayoutInvariants("productionTree", productionTree);
});

describe("computeLayout invariants — familyNetwork", () => {
  defineLayoutInvariants("familyNetwork", () => familyNetwork());
});

describe("computeLayout invariants — productionWithOverflow", () => {
  defineLayoutInvariants("productionWithOverflow", productionWithOverflow);
});
