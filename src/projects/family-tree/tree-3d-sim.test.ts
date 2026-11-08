import { describe, expect, it } from "vitest";
import { NAMED_FIXTURES, productionTree } from "./__fixtures__/trees";
import { GEN_HEIGHT, createTreeSimulation, immediateFamily, settleTreeSimulation } from "./tree-3d-sim";
import type { Tree } from "./types";

// The 3D tree's shape (partners, crown, trunk, side branches) is measured by
// tools/tree-3d-check.ts, run after changing the simulation's forces.

function settled(tree: Tree, rootId = tree.rootId) {
  const sim = createTreeSimulation(tree, rootId);
  settleTreeSimulation(sim);
  return sim;
}

describe("tree 3D simulation", () => {
  it("builds the trunk around the person the tree is viewed from", () => {
    const tree = productionTree();
    const viewRoot = Object.values(tree.persons).find(
      (p) => p.id !== tree.rootId && p.parentIds.length === 2,
    )!;
    const { nodes } = settled(tree, viewRoot.id);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get(viewRoot.id)!.y).toBe(0);
    for (const pid of viewRoot.parentIds) {
      expect(byId.get(pid)!.onTrunkLine).toBe(true);
      expect(byId.get(pid)!.y).toBe(GEN_HEIGHT);
    }
  });
});

describe("immediateFamily", () => {
  it.each([
    ...Object.entries(NAMED_FIXTURES),
    ["production", productionTree],
  ] as const)("is the root's parents, siblings, partners and children (%s)", (_, make) => {
    const tree = make();
    const me = tree.persons[tree.rootId];
    const persons = Object.values(tree.persons);
    const expected = new Set([
      ...me.parentIds,
      ...persons
        .filter((p) => p.parentIds.some((id) => id === tree.rootId || me.parentIds.includes(id)))
        .map((p) => p.id),
      ...me.unions
        .filter((u) => u.status !== "divorced" && u.status !== "ex-partner")
        .map((u) => u.personId),
    ]);
    expected.delete(tree.rootId);

    const { root, family } = immediateFamily(createTreeSimulation(tree, tree.rootId), tree.rootId);

    expect(root.id).toBe(tree.rootId);
    expect(new Set(family.map((n) => n.id))).toEqual(expected);
  });
});
