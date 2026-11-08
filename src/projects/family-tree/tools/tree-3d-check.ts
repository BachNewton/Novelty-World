// Settle the 3D tree's force simulation on every named fixture and the
// production tree, and print its shape against the bars the 3D view is built
// to: partners closer than a generation apart, a crown that widens with each
// generation up, a trunk narrower than the crown, and side branches clear of
// the trunk at ground level. A check to run after changing the simulation's
// forces, not a test. Exits non-zero if any bar fails. Run from the repo root:
//
//   npm run slot -- cores:1 -- npx tsx src/projects/family-tree/tools/tree-3d-check.ts

import { NAMED_FIXTURES, productionTree } from "../__fixtures__/trees";
import { GEN_HEIGHT, createTreeSimulation, settleTreeSimulation, type TreeSimNode } from "../tree-3d-sim";
import type { Tree } from "../types";

function settled(tree: Tree) {
  const sim = createTreeSimulation(tree, tree.rootId);
  settleTreeSimulation(sim);
  return sim;
}

function axisDistance(n: TreeSimNode): number {
  return Math.hypot(n.x, n.z);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function directAncestorsByDepth(tree: Tree): string[][] {
  const byDepth: string[][] = [];
  let frontier = [tree.rootId];
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    const next = frontier.flatMap((id) => tree.persons[id].parentIds).filter((pid) => !seen.has(pid));
    next.forEach((pid) => seen.add(pid));
    if (next.length > 0) byDepth.push([...new Set(next)]);
    frontier = next;
  }
  return byDepth;
}

const fmt = (x: number): string => x.toFixed(1);
let failures = 0;
function report(name: string, check: string, pass: boolean, detail: string): void {
  if (!pass) failures++;
  console.log(`${pass ? "pass" : "FAIL"}  ${name.padEnd(18)} ${check}: ${detail}`);
}

const fixtures: [string, () => Tree][] = [...Object.entries(NAMED_FIXTURES), ["production", productionTree]];
const crownFixtures = new Set(["pedigree", "production"]);

for (const [name, make] of fixtures) {
  const tree = make();
  const { nodes, links } = settled(tree);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // The union line stays shorter than the drop to the couple's children, so a
  // couple always reads as a pair above them.
  const unionLengths = links
    .filter((l) => l.kind === "union")
    .map((l) => Math.hypot(l.source.x - l.target.x, l.source.y - l.target.y, l.source.z - l.target.z));
  if (unionLengths.length > 0) {
    const longest = Math.max(...unionLengths);
    report(name, "partners closer than a generation", longest < GEN_HEIGHT, `longest union ${fmt(longest)} < ${GEN_HEIGHT}`);
  }

  if (crownFixtures.has(name)) {
    const spreads = directAncestorsByDepth(tree).map((ids) => mean(ids.map((id) => axisDistance(byId.get(id)!))));
    const widens = spreads.length >= 2 && spreads.every((s, i) => i === 0 || s > spreads[i - 1]);
    report(name, "crown widens each generation up", widens, `mean spread by depth ${spreads.map(fmt).join(" < ")}`);
  }

  if (name === "production") {
    const root = byId.get(tree.rootId)!;
    const crown = mean(nodes.filter((n) => n.gen <= -2).map(axisDistance));
    report(name, "trunk narrower than crown", axisDistance(root) < crown, `root ${fmt(axisDistance(root))} < crown ${fmt(crown)}`);

    const ground = nodes.filter((n) => n.gen === 0);
    const trunk = Math.max(...ground.filter((n) => n.inTrunk).map(axisDistance));
    const side = Math.min(...ground.filter((n) => !n.inTrunk).map(axisDistance));
    report(name, "side branches clear of trunk", trunk < side, `widest trunk ${fmt(trunk)} < nearest side ${fmt(side)}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks pass");
