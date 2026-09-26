import {
  forceLink,
  forceManyBody,
  forceSimulation,
  type Force,
  type Simulation,
  type SimulationNode,
} from "d3-force-3d";
import { computeGenerations } from "./logic";
import type { Tree, UnionStatus } from "./types";

// Vertical distance between generations. Ancestors climb (+y), descendants
// hang (-y), the root sits at y = 0.
export const GEN_HEIGHT = 120;

const TUNING = {
  charge: -60,
  chargeDistanceMax: 400,
  parentLinkDistance: 130,
  parentLinkStrength: 0.25,
  unionDistance: 0,
  unionStrength: 2,
  exUnionDistance: 30,
  exUnionStrength: 0.4,
  parentPull: 0.25,
  trunkPull: 0.3,
  // Per generation away from the root, the trunk pull shrinks by e^-falloff.
  trunkFalloff: 0.8,
  trunkClearance: GEN_HEIGHT * 1.5,
  heightSpring: 0.3,
  reheatAlpha: 0.6,
};

export interface TreeSimNode extends SimulationNode {
  id: string;
  gen: number;
  targetY: number;
  // Root, its ancestors and its descendants form the trunk; everyone else
  // hangs off a branch and is pushed clear of the trunk.
  onTrunkLine: boolean;
}

export type TreeLinkKind = "parent" | "union" | "ex-union";

export interface TreeSimLink {
  source: TreeSimNode;
  target: TreeSimNode;
  kind: TreeLinkKind;
}

interface ParentGroup {
  child: TreeSimNode;
  parents: TreeSimNode[];
}

export interface TreeSimulation {
  nodes: TreeSimNode[];
  links: TreeSimLink[];
  simulation: Simulation<TreeSimNode>;
  // 0 = pure constellation, 1 = sculpted tree. Reheats the simulation.
  setTidy: (tidy: number) => void;
  settled: () => boolean;
}

// Ended-by-death stays a union: it renders like a marriage.
function isEndedUnion(status: UnionStatus): boolean {
  return status === "divorced" || status === "ex-partner";
}

function trunkLine(tree: Tree): Set<string> {
  const line = new Set([tree.rootId]);
  const up = [tree.rootId];
  while (up.length > 0) {
    for (const pid of tree.persons[up.pop()!].parentIds) {
      if (!line.has(pid)) {
        line.add(pid);
        up.push(pid);
      }
    }
  }
  const descendants = new Set([tree.rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of Object.values(tree.persons)) {
      if (descendants.has(p.id)) continue;
      if (p.parentIds.some((pid) => descendants.has(pid))) {
        descendants.add(p.id);
        grew = true;
      }
    }
  }
  for (const id of descendants) line.add(id);
  return line;
}

function buildGraph(tree: Tree): {
  nodes: TreeSimNode[];
  links: TreeSimLink[];
  parentGroups: ParentGroup[];
} {
  const gens = computeGenerations(tree);
  const line = trunkLine(tree);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const nodes: TreeSimNode[] = Object.keys(tree.persons).map((id, i) => {
    const gen = gens.get(id) ?? 0;
    const r = 10 * Math.sqrt(i + 1);
    return {
      id,
      gen,
      targetY: -gen * GEN_HEIGHT,
      onTrunkLine: line.has(id),
      x: r * Math.cos(i * golden),
      y: -gen * GEN_HEIGHT,
      z: r * Math.sin(i * golden),
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const links: TreeSimLink[] = [];
  const parentGroups: ParentGroup[] = [];
  for (const person of Object.values(tree.persons)) {
    const child = byId.get(person.id)!;
    const parents = person.parentIds.map((pid) => byId.get(pid)!);
    if (parents.length > 0) parentGroups.push({ child, parents });
    for (const parent of parents) {
      links.push({ source: parent, target: child, kind: "parent" });
    }
    // Unions are symmetric, so emit each pair once.
    for (const union of person.unions) {
      if (person.id > union.personId) continue;
      links.push({
        source: child,
        target: byId.get(union.personId)!,
        kind: isEndedUnion(union.status) ? "ex-union" : "union",
      });
    }
  }
  return { nodes, links, parentGroups };
}

// Child and parents' x/z midpoint attract each other, so each couple
// perches above its child and separate lines fork apart.
function parentPullForce(
  groups: ParentGroup[],
  strength: () => number,
): Force<TreeSimNode> {
  return (alpha) => {
    const k = strength() * alpha;
    if (k === 0) return;
    for (const { child, parents } of groups) {
      let mx = 0;
      let mz = 0;
      for (const p of parents) {
        mx += p.x;
        mz += p.z;
      }
      const dx = mx / parents.length - child.x;
      const dz = mz / parents.length - child.z;
      child.vx += dx * k * 0.5;
      child.vz += dz * k * 0.5;
      for (const p of parents) {
        p.vx -= (dx * k * 0.5) / parents.length;
        p.vz -= (dz * k * 0.5) / parents.length;
      }
    }
  };
}

// Shapes the trunk around the x = z = 0 axis, strongest at the root's
// generation and fading away from it: the direct line is pulled in, and
// everyone else is pushed out of a clearance cylinder so side branches
// droop around the trunk instead of crowding it.
function trunkForce(
  nodes: TreeSimNode[],
  strength: () => number,
): Force<TreeSimNode> {
  return (alpha) => {
    const k = strength() * alpha;
    if (k === 0) return;
    for (const n of nodes) {
      const w = k * Math.exp(-Math.abs(n.gen) * TUNING.trunkFalloff);
      if (n.onTrunkLine) {
        n.vx -= n.x * w;
        n.vz -= n.z * w;
        continue;
      }
      const r = Math.hypot(n.x, n.z);
      if (r === 0 || r >= TUNING.trunkClearance) continue;
      const push = ((TUNING.trunkClearance - r) / r) * w;
      n.vx += n.x * push;
      n.vz += n.z * push;
    }
  };
}

// Springs y toward the generation row. At full tidy it snaps instead, so
// the rows are exact rather than a compromise with the other forces.
function heightLockForce(
  nodes: TreeSimNode[],
  tidy: () => number,
): Force<TreeSimNode> {
  return (alpha) => {
    const t = tidy();
    if (t === 0) return;
    for (const n of nodes) {
      if (t >= 1) {
        n.y = n.targetY;
        n.vy = 0;
      } else {
        n.vy += (n.targetY - n.y) * t * TUNING.heightSpring * alpha;
      }
    }
  };
}

export function createTreeSimulation(tree: Tree, tidy: number): TreeSimulation {
  const { nodes, links, parentGroups } = buildGraph(tree);
  let current = tidy;

  const simulation = forceSimulation(nodes, 3)
    .stop()
    .force(
      "links",
      forceLink<TreeSimNode, TreeSimLink>(links)
        .distance((l) =>
          l.kind === "parent"
            ? TUNING.parentLinkDistance
            : l.kind === "union"
              ? TUNING.unionDistance
              : TUNING.exUnionDistance,
        )
        .strength((l) =>
          l.kind === "parent"
            ? TUNING.parentLinkStrength
            : l.kind === "union"
              ? TUNING.unionStrength
              : TUNING.exUnionStrength,
        ),
    )
    .force(
      "charge",
      forceManyBody<TreeSimNode>()
        .strength(TUNING.charge)
        .distanceMax(TUNING.chargeDistanceMax),
    )
    .force("parentPull", parentPullForce(parentGroups, () => current * TUNING.parentPull))
    .force("trunk", trunkForce(nodes, () => current * TUNING.trunkPull))
    // Last, so no later force nudges y after the snap to the row.
    .force("heightLock", heightLockForce(nodes, () => current));

  return {
    nodes,
    links,
    simulation,
    setTidy: (next) => {
      current = next;
      simulation.alpha(Math.max(simulation.alpha(), TUNING.reheatAlpha));
    },
    settled: () => simulation.alpha() < simulation.alphaMin(),
  };
}

// Runs the simulation to rest synchronously. For headless use (tests).
export function settleTreeSimulation(sim: TreeSimulation): void {
  while (!sim.settled()) sim.simulation.tick();
}
