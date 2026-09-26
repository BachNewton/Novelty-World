import { describe, expect, it } from "vitest";
import { NAMED_FIXTURES, productionTree } from "./__fixtures__/trees";
import {
  GEN_HEIGHT,
  createTreeSimulation,
  settleTreeSimulation,
  type TreeSimNode,
} from "./tree-3d-sim";
import type { Tree } from "./types";

function settled(tree: Tree, tidy: number) {
  const sim = createTreeSimulation(tree, tidy);
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
    it.each([0, 0.5, 1])("settles with finite positions at tidy=%s", (tidy) => {
      const { nodes } = settled(make(), tidy);
      for (const n of nodes) {
        expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
      }
    });

    it("locks every node to its generation row at tidy=1", () => {
      const { nodes } = settled(make(), 1);
      for (const n of nodes) {
        expect(n.y).toBeCloseTo(-n.gen * GEN_HEIGHT, 6);
      }
    });

    it("keeps partners close together at tidy=1", () => {
      const { links } = settled(make(), 1);
      for (const l of links) {
        if (l.kind !== "union") continue;
        const d = Math.hypot(
          l.source.x - l.target.x,
          l.source.y - l.target.y,
          l.source.z - l.target.z,
        );
        expect(d).toBeLessThan(GEN_HEIGHT * 0.5);
      }
    });
  });

  it.each([
    ["pedigree", NAMED_FIXTURES.pedigree],
    ["production", productionTree],
  ])("spreads the %s crown wider with each generation up", (_name, make) => {
    const tree = make();
    const { nodes } = settled(tree, 1);
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
    const { nodes } = settled(tree, 1);
    const root = nodes.find((n) => n.id === tree.rootId)!;
    const crown = nodes.filter((n) => n.gen <= -2);
    expect(axisDistance(root)).toBeLessThan(mean(crown.map(axisDistance)));
  });

  it("clears side branches away from the trunk at ground level", () => {
    const { nodes } = settled(productionTree(), 1);
    const ground = nodes.filter((n) => n.gen === 0);
    const trunk = ground.filter((n) => n.onTrunkLine).map(axisDistance);
    const side = ground.filter((n) => !n.onTrunkLine).map(axisDistance);
    expect(Math.max(...trunk)).toBeLessThan(Math.min(...side));
  });
});
