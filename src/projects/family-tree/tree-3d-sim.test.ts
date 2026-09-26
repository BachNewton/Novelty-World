import { describe, expect, it } from "vitest";
import { NAMED_FIXTURES, productionTree } from "./__fixtures__/trees";
import {
  GEN_HEIGHT,
  createTreeSimulation,
  settleTreeSimulation,
  type TreeSimNode,
} from "./tree-3d-sim";
import type { Tree } from "./types";

function settled(tree: Tree, rootId = tree.rootId) {
  const sim = createTreeSimulation(tree, rootId);
  settleTreeSimulation(sim);
  return sim;
}

function axisDistance(n: TreeSimNode): number {
  return Math.hypot(n.x, n.z);
}

function directAncestorsByDepth(tree: Tree): Map<number, string[]> {
  const byDepth = new Map<number, string[]>();
  let frontier = [tree.rootId];
  const seen = new Set(frontier);
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const pid of tree.persons[id].parentIds) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        next.push(pid);
      }
    }
    if (next.length > 0) byDepth.set(depth, next);
    frontier = next;
  }
  return byDepth;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const fixtures: [string, () => Tree][] = [
  ...Object.entries(NAMED_FIXTURES),
  ["production", productionTree],
];

describe("tree 3D simulation", () => {
  describe.each(fixtures)("%s", (_name, make) => {
    it("settles with finite positions", () => {
      const { nodes } = settled(make());
      for (const n of nodes) {
        expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
      }
    });

    it("locks every node to its generation row", () => {
      const { nodes } = settled(make());
      for (const n of nodes) {
        expect(n.y).toBeCloseTo(-n.gen * GEN_HEIGHT, 6);
      }
    });

    // The union line stays shorter than the drop to the couple's children,
    // so a couple always reads as a pair above them.
    it("keeps partners closer together than a generation apart", () => {
      const { links } = settled(make());
      for (const l of links) {
        if (l.kind !== "union") continue;
        const d = Math.hypot(
          l.source.x - l.target.x,
          l.source.y - l.target.y,
          l.source.z - l.target.z,
        );
        expect(d).toBeLessThan(GEN_HEIGHT);
      }
    });
  });

  it.each([
    ["pedigree", NAMED_FIXTURES.pedigree],
    ["production", productionTree],
  ])("spreads the %s crown wider with each generation up", (_name, make) => {
    const tree = make();
    const { nodes } = settled(tree);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const spreads = [...directAncestorsByDepth(tree).entries()]
      .sort(([a], [b]) => a - b)
      .map(([, ids]) => mean(ids.map((id) => axisDistance(byId.get(id)!))));
    expect(spreads.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < spreads.length; i++) {
      expect(spreads[i]).toBeGreaterThan(spreads[i - 1]);
    }
  });

  it("keeps the trunk narrower than the crown on the production tree", () => {
    const tree = productionTree();
    const { nodes } = settled(tree);
    const root = nodes.find((n) => n.id === tree.rootId)!;
    const crown = nodes.filter((n) => n.gen <= -2);
    expect(axisDistance(root)).toBeLessThan(mean(crown.map(axisDistance)));
  });

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

  it("clears side branches away from the trunk at ground level", () => {
    const { nodes } = settled(productionTree());
    const ground = nodes.filter((n) => n.gen === 0);
    const trunk = ground.filter((n) => n.inTrunk).map(axisDistance);
    const side = ground.filter((n) => !n.inTrunk).map(axisDistance);
    expect(Math.max(...trunk)).toBeLessThan(Math.min(...side));
  });
});
